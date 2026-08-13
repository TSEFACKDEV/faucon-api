"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = void 0;
const response_1 = require("../utils/response");
const database_1 = require("../config/database");
/**
 * Restreint une route au rôle ADMIN. Se positionne APRÈS `protect`.
 *
 * Depuis l'ajout du rôle dans le JWT, la décision est prise sans requête
 * DB quand le token porte le rôle (cas nominal). Seuls les tokens émis
 * avant cette évolution (sans champ `role`) déclenchent une lecture en
 * base de secours. Conséquence assumée : une rétrogradation prend effet
 * à l'expiration du token d'accès (~1h) et non plus instantanément.
 */
const requireAdmin = async (req, res, next) => {
    try {
        if (req.user?.role === 'ADMIN') {
            next();
            return;
        }
        // Token ancien génération (sans rôle) → relire en base une seule fois.
        if (!req.user?.role) {
            const user = await database_1.prisma.utilisateur.findUnique({
                where: { id: req.user.id },
                select: { role: true },
            });
            if (user?.role === 'ADMIN') {
                next();
                return;
            }
        }
        (0, response_1.sendError)(res, 'Accès réservé aux administrateurs', 403);
    }
    catch {
        (0, response_1.sendError)(res, 'Impossible de vérifier vos droits', 401);
    }
};
exports.requireAdmin = requireAdmin;
