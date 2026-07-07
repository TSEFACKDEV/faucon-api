import { prisma } from "../config/database";
import { haversineMeters } from "../utils/geo";

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

  // Vérifier qu'il n'y a pas déjà une alarme non acquittée récente
  const recent = await prisma.alarme.findFirst({
    where: {
      vehiculeId,
      typeAlarme:   'SORTIE_ZONE',
      estAcquittee: false,
      horodatage:   { gte: new Date(Date.now() - 5 * 60 * 1000) }, // 5 min
    },
  });

  if (recent) return;

  await prisma.alarme.create({
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

  console.warn(`[ALARM] SORTIE_ZONE — ${vehiculeId} — distance: ${Math.round(distance)}m > rayon: ${geofence.rayonMetres}m`);
};