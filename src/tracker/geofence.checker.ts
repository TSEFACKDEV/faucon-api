import { prisma } from "../config/database";
import { haversineMeters } from "../utils/geo";
import { hasRecentUnacknowledgedAlarm } from "./alarm-dedup";
import { broadcastAlarm } from "./websocket.service";

export const checkGeofence = async (
  vehiculeId: string,
  lat: number,
  lon: number
): Promise<void> => {
  const geofence = await prisma.perimetreGeofence.findUnique({
    where: { vehiculeId },
  });

  if (!geofence || !geofence.estActif) return;

  const distance = haversineMeters(
    lat, lon,
    geofence.centreLat,
    geofence.centreLon
  );

  const isOutside = distance > geofence.rayonMetres;

  if (!isOutside) return;

  if (await hasRecentUnacknowledgedAlarm(vehiculeId, 'SORTIE_ZONE', 5 * 60 * 1000)) {
    return;
  }

  const alarme = await prisma.alarme.create({
    data: {
      vehiculeId,
      typeAlarme:    'SORTIE_ZONE',
      latitude:      lat,
      longitude:     lon,
      valeurMesuree: Math.round(distance),
      seuilConfigure: geofence.rayonMetres,
      horodatage:    new Date(),
    },
  });

  broadcastAlarm(vehiculeId, {
    id:           alarme.id,
    vehiculeId,
    typeAlarme:   'SORTIE_ZONE',
    latitude:     lat,
    longitude:    lon,
    horodatage:   alarme.horodatage.toISOString(),
  });

  console.warn(`[ALARM] SORTIE_ZONE — ${vehiculeId} — distance: ${Math.round(distance)}m > rayon: ${geofence.rayonMetres}m`);
};