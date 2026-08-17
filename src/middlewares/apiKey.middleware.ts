import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';
import { secureEqual } from '../utils/timingSafeEqual';

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
  if (typeof provided !== 'string' || !secureEqual(provided, expected)) {
    sendError(res, 'Clé de provisioning invalide', 401);
    return;
  }

  next();
};

/**
 * Protège /tracker/webhook et /tracker/sms par une clé partagée optionnelle.
 * "Optionnelle" et volontairement permissive tant que TRACKER_WEBHOOK_KEY
 * n'est pas définie : ces routes sont utilisées par des boîtiers déjà
 * déployés sur le terrain qui n'envoient aujourd'hui aucune clé — les
 * bloquer purement et simplement couperait leur seul canal de secours
 * (HTTP/SMS) quand le canal MQTT principal est indisponible, exactement le
 * scénario où on a le plus besoin d'eux. Dès que le firmware sera mis à jour
 * pour transmettre cette clé (paramètre `key`), définir TRACKER_WEBHOOK_KEY
 * active l'application stricte. En attendant, seul le rate limiting (voir
 * tracker.routes.ts) protège ces routes contre le brute-force d'identifiant.
 */
export const requireTrackerWebhookKey = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const expected = process.env.TRACKER_WEBHOOK_KEY;
  if (!expected) {
    next();
    return;
  }

  const provided = String(req.query.key ?? req.headers['x-tracker-key'] ?? '');
  if (!secureEqual(provided, expected)) {
    sendError(res, 'Clé traceur invalide', 401);
    return;
  }

  next();
};
