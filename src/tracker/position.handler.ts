
import { TramePosition } from '../types/tracker.types';
import { broadcastPosition } from '../tracker/websocket.service';
import { checkGeofence } from '../tracker/geofence.checker';
import { checkSpeedLimit } from '../tracker/speed.checker';
import { prisma } from '../config/database';

interface PositionPayload {
  latitude: number;
  longitude: number;
  vitesse: number;
  cap: number;
  battery: number;
  timestamp: Date;
  source: 'http' | 'sms' | 'tcp';
  eventType?: string;
  cycleNumber?: number;
  alertCount?: number;
}

export const handlePositionPayload = async (
  vehiculeId: string,
  payload: PositionPayload
): Promise<void> => {
  try {
    // 1. Sauvegarder la position
    await prisma.position.create({
      data: {
        vehiculeId,
        latitude:      payload.latitude,
        longitude:     payload.longitude,
        vitesse:       payload.vitesse,
        cap:           payload.cap,
        niveauBatterie: payload.battery,
        statutACC:     false,
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
      horodatage: payload.timestamp.toISOString(),
      source:    payload.source,
      eventType: payload.eventType,
    });

    // 4. Vérifications asynchrones (ne bloquent pas la réponse au traceur)
    checkGeofence(vehiculeId, payload.latitude, payload.longitude).catch(console.error);
    checkSpeedLimit(vehiculeId, payload.vitesse).catch(console.error);
    checkBatteryLevel(vehiculeId, payload.battery).catch(console.error);

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
    timestamp: new Date(trame.ts),
    source: 'tcp',
  });
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