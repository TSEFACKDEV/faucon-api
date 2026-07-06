
import { TrameEvent } from '../types/tracker.types';
import { broadcastAlarm } from './websocket.service';
import { prisma } from '../config/database';

export const handleEvent = async (
  trame: TrameEvent,
  vehiculeId: string
): Promise<void> => {
  try {
    const alarme = await prisma.alarme.create({
      data: {
        vehiculeId,
        typeAlarme:    trame.event,
        latitude:      trame.lat,
        longitude:     trame.lon,
        valeurMesuree: trame.value,
        seuilConfigure: trame.threshold,
        horodatage:    new Date(trame.ts),
      },
    });

    // Broadcast WebSocket immédiat
    broadcastAlarm(vehiculeId, {
      id:          alarme.id,
      vehiculeId,
      typeAlarme:  trame.event,
      latitude:    trame.lat,
      longitude:   trame.lon,
      horodatage:  alarme.horodatage.toISOString(),
    });

    console.warn(`[EVENT] ${trame.event} — ${trame.imei}`);
  } catch (err) {
    console.error(`[EVENT] Erreur :`, err);
    throw err;
  }
};