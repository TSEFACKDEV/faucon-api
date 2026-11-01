
import { TramePosition, EventType } from '../types/tracker.types';
import { broadcastPosition, broadcastAlarm } from '../tracker/websocket.service';
import { checkGeofence } from '../tracker/geofence.checker';
import { checkSpeedLimit } from '../tracker/speed.checker';
import { prisma } from '../config/database';
import { hasRecentUnacknowledgedAlarm } from './alarm-dedup';

interface PositionPayload {
  latitude: number;
  longitude: number;
  vitesse: number;
  cap?: number;
  battery: number;
  timestamp: Date;
  source: 'http' | 'sms' | 'tcp' | 'mqtt';
  acc?: boolean;
  satellites?: number; // nombre de satellites GPS captés
  signal?: number;     // qualité du signal réseau, en % (0-100)
  eventType?: string;
  eventValue?: number;
  eventThreshold?: number;
  cycleNumber?: number;
  alertCount?: number;
}

export const handlePositionPayload = async (
  vehiculeId: string,
  payload: PositionPayload
): Promise<void> => {
  try {
    // Déduplication : une même trame peut être redélivrée (QoS 1) ou arriver
    // par deux canaux redondants (TCP + MQTT). On ne persiste qu'une position
    // par véhicule pour un MÊME point GPS et un même horodatage (± 2 s).
    //
    // Important : deux positions distinctes peuvent partager la même seconde
    // (le firmware a une granularité de 1 s) — les coordonnées font donc
    // partie de la clé de déduplication. Avant, la deuxième position de la
    // même seconde était perdue et l'historique sautait un point.
    //
    // Le contrôle (findFirst) puis l'écriture (create) ne sont pas atomiques
    // par nature : deux trames quasi simultanées pour le MÊME véhicule
    // peuvent toutes deux passer le contrôle avant qu'aucune n'ait committé
    // son insert. `pg_advisory_xact_lock` sérialise les écritures pour un
    // même véhicule (verrou tenu le temps de la transaction, relâché au
    // commit) sans verrouiller de ligne ni gêner les autres véhicules.
    const isNewPosition = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${vehiculeId})::bigint)`;

      const duplicate = await tx.position.findFirst({
        where: {
          vehiculeId,
          latitude: payload.latitude,
          longitude: payload.longitude,
          horodatage: {
            gte: new Date(payload.timestamp.getTime() - 2000),
            lte: new Date(payload.timestamp.getTime() + 2000),
          },
        },
        select: { id: true, horodatage: true },
      });
      if (duplicate) {
        // Plusieurs trames du firmware peuvent partager le même horodatage
        // (granularité d'une seconde) avec des valeurs différentes : la
        // première ne doit pas figer signal/satellites/cap. On met à jour la
        // ligne existante avec la trame la plus récente, sans écraser les
        // champs optionnels absents par null/0.
        if (payload.timestamp.getTime() >= duplicate.horodatage.getTime()) {
          await tx.position.update({
            where: { id: duplicate.id },
            data: {
              latitude: payload.latitude,
              longitude: payload.longitude,
              vitesse: payload.vitesse,
              niveauBatterie: payload.battery,
              ...(payload.cap !== undefined ? { cap: payload.cap } : {}),
              ...(payload.satellites !== undefined
                  ? { nbSatellites: payload.satellites }
                  : {}),
              ...(payload.signal !== undefined
                  ? { niveauSignal: payload.signal }
                  : {}),
              ...(payload.acc !== undefined ? { statutACC: payload.acc } : {}),
              ...(payload.cycleNumber !== undefined
                  ? { cyc: payload.cycleNumber }
                  : {}),
              ...(payload.alertCount !== undefined
                  ? { alr: payload.alertCount }
                  : {}),
            },
          });
          await tx.vehicule.update({
            where: { id: vehiculeId },
            data: {
              derniereCommunication: payload.timestamp,
              niveauBatterie: payload.battery,
            },
          });
        }
        return false;
      }

      // 1. Sauvegarder la position
      await tx.position.create({
        data: {
          vehiculeId,
          latitude:      payload.latitude,
          longitude:     payload.longitude,
          vitesse:       payload.vitesse,
          cap:           payload.cap,
          nbSatellites:  payload.satellites,
          niveauSignal:  payload.signal,
          niveauBatterie: payload.battery,
          statutACC:     payload.acc ?? false,
          cyc:           payload.cycleNumber,
          alr:           payload.alertCount,
          horodatage:    payload.timestamp,
        },
      });

      // 2. Mettre à jour la dernière communication du véhicule
      await tx.vehicule.update({
        where: { id: vehiculeId },
        data: {
          derniereCommunication: payload.timestamp,
          niveauBatterie: payload.battery,
        },
      });

      return true;
    });

    // Point déjà présent : on diffuse quand même la trame (le dashboard a
    // besoin de la fraîcheur) sans créer de nouvelle rangée.
    if (!isNewPosition) {
      broadcastPosition(vehiculeId, {
        vehiculeId,
        latitude:  payload.latitude,
        longitude: payload.longitude,
        vitesse:   payload.vitesse,
        cap:       payload.cap,
        battery:   payload.battery,
        satellites: payload.satellites,
        signal:    payload.signal,
        statutACC: payload.acc,
        horodatage: payload.timestamp.toISOString(),
        source:    payload.source,
        eventType: payload.eventType,
      });

      // CRUCIAL : un événement (décollement, choc…) peut être porté par une
      // trame dont la position a déjà été enregistrée par l'autre canal.
      // Avant, on sortait ici et l'alarme n'était jamais créée.
      if (payload.eventType && payload.source !== 'tcp') {
        await recordEventAlarm(
          vehiculeId, payload.eventType as EventType,
          payload.latitude, payload.longitude, payload.timestamp,
          payload.eventValue, payload.eventThreshold
        );
      }
      checkBatteryLevel(
        vehiculeId, payload.battery, payload.latitude, payload.longitude
      ).catch(console.error);

      console.log(`[POSITION] ${vehiculeId} → point déjà connu (${payload.source})`);
      return;
    }

    // 3. Broadcast WebSocket vers le dashboard admin
    broadcastPosition(vehiculeId, {
      vehiculeId,
      latitude:  payload.latitude,
      longitude: payload.longitude,
      vitesse:   payload.vitesse,
      cap:       payload.cap,
      battery:   payload.battery,
      satellites: payload.satellites,
      signal:    payload.signal,
      statutACC: payload.acc,
      horodatage: payload.timestamp.toISOString(),
      source:    payload.source,
      eventType: payload.eventType,
    });

    // 4. Vérifications asynchrones (ne bloquent pas la réponse au traceur)
    checkGeofence(
      vehiculeId,
      payload.latitude,
      payload.longitude,
      payload.satellites,
      payload.timestamp,
    ).catch(console.error);
    checkSpeedLimit(
      vehiculeId,
      payload.vitesse,
      payload.latitude,
      payload.longitude,
      payload.satellites,
      payload.timestamp,
    ).catch(console.error);
    checkBatteryLevel(vehiculeId, payload.battery, payload.latitude, payload.longitude).catch(console.error);

    // 5. Événement transmis par les canaux HTTP/SMS (le canal TCP passe par
    // une trame EVENT dédiée, gérée par event.handler.ts).
    if (payload.eventType && payload.source !== 'tcp') {
      await recordEventAlarm(
        vehiculeId, payload.eventType as EventType, payload.latitude, payload.longitude,
        payload.timestamp, payload.eventValue, payload.eventThreshold
      );
    }

    console.log(`[POSITION] ${vehiculeId} → lat:${payload.latitude} lon:${payload.longitude} speed:${payload.vitesse}km/h source:${payload.source}`);
  } catch (err) {
    console.error(`[POSITION] Erreur sauvegarde :`, err);
    throw err;
  }
};

export const handlePosition = async (
  trame: TramePosition,
  vehiculeId: string
): Promise<void> => {
  await handlePositionPayload(vehiculeId, {
    latitude: trame.lat,
    longitude: trame.lon,
    vitesse: trame.speed,
    cap: trame.cap,
    battery: trame.battery,
    satellites: trame.sats,
    signal: trame.signal,
    timestamp: new Date(trame.ts),
    source: 'tcp',
    acc: trame.acc,
  });
};

const checkBatteryLevel = async (
  vehiculeId: string,
  battery: number,
  latitude: number,
  longitude: number
): Promise<void> => {
  // Batterie remontée : on clôture une éventuelle alerte encore active afin
  // qu'une nouvelle baisse puisse être signalée plus tard.
  if (battery > 25) {
    await prisma.alarme.updateMany({
      where: {
        vehiculeId,
        typeAlarme: 'BATTERIE_FAIBLE',
        estAcquittee: false,
      },
      data: {
        estAcquittee: true,
        dateAcquittement: new Date(),
      },
    });
    return;
  }

  // Zone neutre (21–25 %) : ni alerte, ni réinitialisation.
  if (battery > 20) return;

  const vehicule = await prisma.vehicule.findUnique({
    where: { id: vehiculeId },
    select: {
      alarmes: {
        where: {
          typeAlarme: 'BATTERIE_FAIBLE',
          estAcquittee: false,
        },
        take: 1,
      },
    },
  });

  // Si une alarme batterie faible est déjà active et non acquittée, on ne
  // crée pas de doublon, même si elle date de plusieurs heures.
  if (vehicule?.alarmes.length) return;

  await prisma.alarme.create({
    data: {
      vehiculeId,
      typeAlarme:    'BATTERIE_FAIBLE',
      latitude,
      longitude,
      valeurMesuree: battery,
      seuilConfigure: 20,
      horodatage:    new Date(),
    },
  });

  broadcastAlarm(vehiculeId, {
    typeAlarme:   'BATTERIE_FAIBLE',
    latitude,
    longitude,
    horodatage:   new Date().toISOString(),
  });

  console.warn(`[ALARM] BATTERIE_FAIBLE — ${vehiculeId} — ${battery}%`);
};

/**
 * Persiste et diffuse une alarme reçue via un canal qui ne transporte pas
 * de trame EVENT dédiée (HTTP webhook, SMS).
 */
const recordEventAlarm = async (
  vehiculeId: string,
  typeAlarme: EventType,
  latitude: number,
  longitude: number,
  horodatage: Date,
  valeurMesuree?: number,
  seuilConfigure?: number
): Promise<void> => {
  if (await hasRecentUnacknowledgedAlarm(vehiculeId, typeAlarme, 5 * 60 * 1000)) {
    return;
  }

  const alarme = await prisma.alarme.create({
    data: { vehiculeId, typeAlarme, latitude, longitude, horodatage, valeurMesuree, seuilConfigure },
  });

  broadcastAlarm(vehiculeId, {
    id: alarme.id,
    vehiculeId,
    typeAlarme,
    latitude,
    longitude,
    horodatage: alarme.horodatage.toISOString(),
  });

  console.warn(`[ALARM] ${typeAlarme} — ${vehiculeId} (source événement)`);
};