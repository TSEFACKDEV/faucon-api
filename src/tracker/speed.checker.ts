import { prisma } from "../config/database";
import { hasRecentUnacknowledgedAlarm } from "./alarm-dedup";
import { broadcastAlarm } from "./websocket.service";

// Vitesse maximale réaliste (km/h) au-delà de laquelle une mesure GPS est
// considérée comme aberrante (pic de bruit, multipath, tunnel).
const MAX_REALISTIC_SPEED_KMH = 180;

// Fenêtre pendant laquelle deux mesures consécutives doivent dépasser le
// seuil pour confirmer une vitesse excessive (évite les pics GPS isolés).
const SPEED_CONFIRMATION_WINDOW_MS = 10 * 60 * 1000;

export const checkSpeedLimit = async (
  vehiculeId: string,
  speed: number,
  latitude: number,
  longitude: number,
  satellites?: number, // qualité GPS de la position courante
  timestamp?: Date, // horodatage de la position courante (pour trouver la précédente)
): Promise<void> => {
  const limit = await prisma.limiteVitesse.findUnique({
    where: { vehiculeId },
  });

  if (!limit || !limit.estActive) return;

  // Rejette les vitesses aberrantes (probablement du bruit GPS).
  if (speed > MAX_REALISTIC_SPEED_KMH) {
    return;
  }

  if (speed <= limit.seuilKmh) return;

  // Rejette les positions avec un GPS trop imprécis pour une alarme de vitesse.
  if (satellites != null && satellites < 4) {
    return;
  }

  // Vérifie que la position précédente était également au-dessus du seuil
  // (évite le déclenchement sur un pic instantané). On exclut la position
  // courante, déjà insérée en base, et on exige qu'elle soit récente.
  const previousPosition = await prisma.position.findFirst({
    where: {
      vehiculeId,
      horodatage: {
        ...(timestamp ? { lt: timestamp } : {}),
        gte: new Date(Date.now() - SPEED_CONFIRMATION_WINDOW_MS),
      },
    },
    orderBy: { horodatage: 'desc' },
  });

  if (!previousPosition) return;

  if (previousPosition.vitesse <= limit.seuilKmh) {
    // Première mesure au-dessus du seuil : attend la confirmation
    // de la prochaine position avant de créer l'alarme.
    return;
  }

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
