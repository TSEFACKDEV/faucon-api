"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimit = void 0;
const response_1 = require("../utils/response");
/**
 * Limiteur de débit minimal en mémoire (fenêtre fixe, par IP). Suffisant
 * pour une seule instance de serveur ; à remplacer par une solution
 * partagée (Redis) si le service est un jour scalé horizontalement.
 */
const rateLimit = (maxRequests, windowMs) => {
    const buckets = new Map();
    return (req, res, next) => {
        const key = req.ip ?? 'unknown';
        const now = Date.now();
        const bucket = buckets.get(key);
        if (!bucket || bucket.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + windowMs });
            next();
            return;
        }
        if (bucket.count >= maxRequests) {
            (0, response_1.sendError)(res, 'Trop de tentatives, réessayez plus tard', 429);
            return;
        }
        bucket.count += 1;
        next();
    };
};
exports.rateLimit = rateLimit;
