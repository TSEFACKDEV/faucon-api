import { prisma } from "../config/database";


/**
 * Calcule la distance en mètres entre deux points GPS
 * via la formule de Haversine.
 */
const haversineDistance = (
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number => {
  const R = 6371000; // Rayon de la Terre en mètres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const checkGeofence = async (
  vehiculeId: string,
  lat: number,
  lon: number
): Promise<void> => {
  const geofence = await prisma.perimetreGeofence.findUnique({
    where: { vehiculeId },
  });

  if (!geofence || !geofence.estActif) return;

  const distance = haversineDistance(
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