import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { sendError } from '../utils/response';
import { prisma } from '../config/database';

/**
 * Restreint une route au rôle ADMIN. Se positionne APRÈS `protect`.
 *
 * Depuis l'ajout du rôle dans le JWT, la décision est prise sans requête
 * DB quand le token porte le rôle (cas nominal). Seuls les tokens émis
 * avant cette évolution (sans champ `role`) déclenchent une lecture en
 * base de secours. Conséquence assumée : une rétrogradation prend effet
 * à l'expiration du token d'accès (~1h) et non plus instantanément.
 */
export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.user?.role === 'ADMIN') {
      next();
      return;
    }

    // Token ancien génération (sans rôle) → relire en base une seule fois.
    if (!req.user?.role) {
      const user = await prisma.utilisateur.findUnique({
        where: { id: req.user!.id },
        select: { role: true },
      });
      if (user?.role === 'ADMIN') {
        next();
        return;
      }
    }

    sendError(res, 'Accès réservé aux administrateurs', 403);
  } catch {
    sendError(res, 'Impossible de vérifier vos droits', 401);
  }
};
