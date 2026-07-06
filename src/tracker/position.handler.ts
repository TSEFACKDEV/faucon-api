
import { TramePosition } from '../types/tracker.types';
import { broadcastPosition } from '../tracker/websocket.service';
import { checkGeofence } from '../tracker/geofence.checker';
import { checkSpeedLimit } from '../tracker/speed.checker';
import { prisma } from '../config/database';

export const handlePosition = async (
  trame: TramePosition,
  vehiculeId: string
): Promise<void> => {
  try {
    // 1. Sauvegarder la position
    const position = await prisma.position.create({
      data: {
        vehiculeId,
        latitude:      trame.lat,
        longitude:     trame.lon,
        altitude:      trame.alt,
        vitesse:       trame.speed,
        cap:           trame.cap,
        nbSatellites:  trame.sats,
        hdop:          trame.hdop,
        niveauBatterie: trame.battery,
        statutACC:     trame.acc,
        horodatage:    new Date(trame.ts),
      },
    });

    // 2. Mettre à jour la dernière communication du véhicule
    await prisma.vehicule.update({
      where: { id: vehiculeId },
      data: {
        derniereCommunication: new Date(trame.ts),
        niveauBatterie: trame.battery,
      },
    });

    // 3. Broadcast WebSocket vers le dashboard admin
    broadcastPosition(vehiculeId, {
      vehiculeId,
      latitude:  trame.lat,
      longitude: trame.lon,
      vitesse:   trame.speed,
      cap:       trame.cap,
      battery:   trame.battery,
      horodatage: new Date(trame.ts).toISOString(),
    });

    // 4. Vérifications asynchrones (ne bloquent pas la réponse au traceur)
    checkGeofence(vehiculeId, trame.lat, trame.lon).catch(console.error);
    checkSpeedLimit(vehiculeId, trame.speed).catch(console.error);
    checkBatteryLevel(vehiculeId, trame.battery).catch(console.error);

    console.log(`[POSITION] ${trame.imei} → lat:${trame.lat} lon:${trame.lon} speed:${trame.speed}km/h`);
  } catch (err) {
    console.error(`[POSITION] Erreur sauvegarde :`, err);
    throw err;
  }
};

const checkBatteryLevel = async (vehiculeId: string, battery: number): Promise<void> => {
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
      latitude:      0,
      longitude:     0,
      valeurMesuree: battery,
      seuilConfigure: 20,
      horodatage:    new Date(),
    },
  });

  console.warn(`[ALARM] BATTERIE_FAIBLE — ${vehiculeId} — ${battery}%`);
};