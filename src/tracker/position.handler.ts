
import { TramePosition, EventType } from '../types/tracker.types';
import { broadcastPosition, broadcastAlarm } from '../tracker/websocket.service';
import { checkGeofence } from '../tracker/geofence.checker';
import { checkSpeedLimit } from '../tracker/speed.checker';
import { prisma } from '../config/database';

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
    // Déduplication : une même trame peut arriver par plusieurs canaux
    // (firmware → `raw` ET relais → `data`, TCP + MQTT redondants) ou être
    // redélivrée (QoS 1). On ne persiste qu'une position par véhicule pour un
    // même horodatage (± 2 s), sinon l'historique et la trace sont faussés.
    const duplicate = await prisma.position.findFirst({
      where: {
        vehiculeId,
        horodatage: {
          gte: new Date(payload.timestamp.getTime() - 2000),
          lte: new Date(payload.timestamp.getTime() + 2000),
        },
      },
      select: { id: true },
    });

    // Duplicata : on diffuse quand même en temps réel (le dashboard a besoin
    // de la fraîcheur) mais on ne crée pas de nouvelle rangée.
    if (duplicate) {
      broadcastPosition(vehiculeId, {
        vehiculeId,
        latitude:  payload.latitude,
        longitude: payload.longitude,
        vitesse:   payload.vitesse,
        cap:       payload.cap,
        battery:   payload.battery,
        satellites: payload.satellites,
        signal:    payload.signal,
        horodatage: payload.timestamp.toISOString(),
        source:    payload.source,
        eventType: payload.eventType,
      });
      console.log(`[POSITION] ${vehiculeId} → duplicata ignoré (${payload.source})`);
      return;
    }

    // 1. Sauvegarder la position
    await prisma.position.create({
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
    await prisma.vehicule.update({
      where: { id: vehiculeId },
      data: {
        derniereCommunication: payload.timestamp,
        niveauBatterie: payload.battery,
      },
    });

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
      horodatage: payload.timestamp.toISOString(),
      source:    payload.source,
      eventType: payload.eventType,
    });

    // 4. Vérifications asynchrones (ne bloquent pas la réponse au traceur)
    checkGeofence(vehiculeId, payload.latitude, payload.longitude).catch(console.error);
    checkSpeedLimit(vehiculeId, payload.vitesse, payload.latitude, payload.longitude).catch(console.error);
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
  if (battery > 20) return;

  const vehicule = await prisma.vehicule.findUnique({
    where: { id: vehiculeId },
    select: { alarmes: { where: {
      typeAlarme: 'BATTERIE_FAIBLE',
      estAcquittee: false,
      horodatage: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // dernière heure
    }, take: 1 } },
  });

  // Éviter les doublons d'alarmes batterie
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