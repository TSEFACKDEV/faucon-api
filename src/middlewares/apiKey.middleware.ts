import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

/**
 * Protège les routes internes d'exploitation (provisioning en série) par une
 * clé API statique plutôt qu'un compte utilisateur — cet outil est utilisé
 * par l'équipe, pas par les clients, il n'y a pas encore de notion de rôle.
 */
export const requireProvisioningKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const expected = process.env.PROVISIONING_API_KEY;
  if (!expected) {
    sendError(res, 'Provisioning désactivé (PROVISIONING_API_KEY absente)', 503);
    return;
  }

  const provided = req.headers['x-provisioning-key'];
  if (provided !== expected) {
    sendError(res, 'Clé de provisioning invalide', 401);
    return;
  }

  next();
};
