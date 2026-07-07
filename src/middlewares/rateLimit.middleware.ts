import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Limiteur de débit minimal en mémoire (fenêtre fixe, par IP). Suffisant
 * pour une seule instance de serveur ; à remplacer par une solution
 * partagée (Redis) si le service est un jour scalé horizontalement.
 */
export const rateLimit = (maxRequests: number, windowMs: number) => {
  const buckets = new Map<string, Bucket>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (bucket.count >= maxRequests) {
      sendError(res, 'Trop de tentatives, réessayez plus tard', 429);
      return;
    }

    bucket.count += 1;
    next();
  };
};
