import { prisma } from "../config/database";
import { hasRecentUnacknowledgedAlarm } from "./alarm-dedup";
import { broadcastAlarm } from "./websocket.service";

export const checkSpeedLimit = async (
  vehiculeId: string,
  speed: number,
  latitude: number,
  longitude: number
): Promise<void> => {
  const limit = await prisma.limiteVitesse.findUnique({
    where: { vehiculeId },
  });

  if (!limit || !limit.estActive) return;
  if (speed <= limit.seuilKmh) return;

  if (await hasRecentUnacknowledgedAlarm(vehiculeId, 'VITESSE_EXCESSIVE', 60 * 1000)) {
    return;
  }

  const alarme = await prisma.alarme.create({
    data: {
      vehiculeId,
      typeAlarme:    'VITESSE_EXCESSIVE',
      latitude,
      longitude,
      valeurMesuree: speed,
      seuilConfigure: limit.seuilKmh,
      horodatage:    new Date(),
    },
  });

  broadcastAlarm(vehiculeId, {
    id:           alarme.id,
    vehiculeId,
    typeAlarme:   'VITESSE_EXCESSIVE',
    latitude,
    longitude,
    horodatage:   alarme.horodatage.toISOString(),
  });

  console.warn(`[ALARM] VITESSE_EXCESSIVE — ${vehiculeId} — ${speed}km/h > seuil: ${limit.seuilKmh}km/h`);
};