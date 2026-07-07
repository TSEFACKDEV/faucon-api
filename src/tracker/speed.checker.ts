import { prisma } from "../config/database";


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

  // Éviter les doublons dans la même minute
  const recent = await prisma.alarme.findFirst({
    where: {
      vehiculeId,
      typeAlarme:   'VITESSE_EXCESSIVE',
      estAcquittee: false,
      horodatage:   { gte: new Date(Date.now() - 60 * 1000) },
    },
  });

  if (recent) return;

  await prisma.alarme.create({
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

  console.warn(`[ALARM] VITESSE_EXCESSIVE — ${vehiculeId} — ${speed}km/h > seuil: ${limit.seuilKmh}km/h`);
};