import { prisma } from '../config/database';

/**
 * Retrouve un véhicule à partir de l'identifiant transmis par un traceur
 * (IMEI ou trackerId — les deux formats coexistent selon le matériel).
 */
export const findVehiculeByIdentifier = (identifier: string) =>
  prisma.vehicule.findFirst({
    where: {
      OR: [
        { imei: identifier },
        { trackerId: identifier },
      ],
    },
  });
