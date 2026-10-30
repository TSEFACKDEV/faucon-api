import { NextFunction, Response } from 'express';
import { AuthRequest } from '../types';
import { sendError } from '../utils/response';
import { extractApiKey, resolveApiKey } from '../services/apiKey.service';

/**
 * Authentifie une intégration client avec une clé API en lecture seule.
 *
 * Une clé ne donne accès qu'aux véhicules de son propriétaire. Elle ne
 * permet aucune opération d'écriture, ne donne pas accès au compte et ne
 * peut pas lire les données internes de l'exploitation Faucon.
 */
export const requireOwnerApiKey = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rawKey = extractApiKey(req.headers as Record<string, unknown>);
    if (!rawKey) {
      sendError(res, 'Clé API manquante', 401);
      return;
    }

    const utilisateurId = await resolveApiKey(rawKey);
    if (!utilisateurId) {
      sendError(res, 'Clé API invalide, révoquée ou expirée', 401);
      return;
    }

    req.user = {
      id: utilisateurId,
      email: '',
      userName: '',
    };
    next();
  } catch {
    sendError(res, 'Impossible de vérifier la clé API', 401);
  }
};
