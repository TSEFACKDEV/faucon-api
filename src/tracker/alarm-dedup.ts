import { prisma } from '../config/database';
import { EventType } from '../types/tracker.types';

// Évite de créer une alarme en double quand une alarme du même type, pour le
// même véhicule, non encore acquittée, existe déjà dans la fenêtre récente —
// une redélivrance MQTT/TCP, un capteur qui déclenche deux fois de suite, ou
// deux canaux redondants ne doivent pas générer deux alarmes distinctes.
// Même convention que geofence.checker.ts / speed.checker.ts.
export const hasRecentUnacknowledgedAlarm = async (
  vehiculeId: string,
  typeAlarme: EventType,
  windowMs: number
): Promise<boolean> => {
  const recent = await prisma.alarme.findFirst({
    where: {
      vehiculeId,
      typeAlarme,
      estAcquittee: false,
      horodatage:   { gte: new Date(Date.now() - windowMs) },
    },
    select: { id: true },
  });
  return !!recent;
};
