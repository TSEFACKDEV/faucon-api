import { randomInt } from 'crypto';
import { prisma } from '../config/database';
import { AppError } from '../utils/errors';

// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L) pour un PIN lisible
// sur une étiquette imprimée.
const PIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const PIN_LENGTH = 6;
const MAX_TENTATIVES_UNICITE = 20;

const genererPin = (): string =>
  Array.from({ length: PIN_LENGTH }, () => PIN_ALPHABET[randomInt(PIN_ALPHABET.length)]).join('');

const genererSuffixe = (): string => String(randomInt(0, 10000)).padStart(4, '0');

export interface VehiculeProvisionne {
  trackerId: string;
  pinActivation: string;
}

/**
 * Pré-enregistre un lot de traceurs avant leur flashage/vente. Chaque
 * trackerId généré ici doit être recopié dans la constante TRACKER_ID du
 * firmware de l'unité correspondante, et le pin imprimé sur l'étiquette du
 * boîtier (jamais affiché ailleurs) — il sera exigé par l'app au moment où
 * le client relie le traceur à son compte.
 */
export const provisionerLot = async (
  count: number,
  prefix: string
): Promise<VehiculeProvisionne[]> => {
  // Number(req.body.count) sur une valeur non numérique donne NaN, qui rate
  // silencieusement les deux comparaisons ci-dessous (NaN < 1 et NaN > 500
  // sont toutes deux fausses) — Number.isInteger ferme ce passage.
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new AppError('count doit être un entier compris entre 1 et 500', 400);
  }
  if (!/^[A-Z0-9]{2,10}$/i.test(prefix)) {
    throw new AppError('prefix invalide (2 à 10 caractères alphanumériques)', 400);
  }

  const resultats: VehiculeProvisionne[] = [];

  for (let i = 0; i < count; i++) {
    let cree: VehiculeProvisionne | null = null;

    // La vérification d'unicité puis la création sont deux requêtes
    // distinctes : deux lots provisionnés en parallèle pourraient générer le
    // même candidat entre les deux. On ferme la fenêtre en retentant sur une
    // violation de contrainte unique côté DB plutôt qu'en se fiant au seul
    // pré-check findUnique.
    for (let tentative = 0; tentative < MAX_TENTATIVES_UNICITE && !cree; tentative++) {
      const trackerId = `${prefix.toUpperCase()}-${genererSuffixe()}`;
      const pinActivation = genererPin();

      try {
        await prisma.vehicule.create({
          data: {
            trackerId,
            pinActivation,
            nom: `Traceur ${trackerId}`,
            estActif: false,
          },
        });
        cree = { trackerId, pinActivation };
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
        // Collision sur trackerId : on retente avec un nouveau candidat.
      }
    }

    if (!cree) {
      throw new AppError(
        `Impossible de générer un trackerId unique pour le préfixe "${prefix}" — préfixe probablement saturé`,
        409
      );
    }

    resultats.push(cree);
  }

  return resultats;
};
