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
    // Sans purge, `buckets` grossit indéfiniment avec le nombre d'IP uniques
    // vues (process qui tourne en continu) — un nettoyage périodique retire les
    // entrées dont la fenêtre est expirée. Le timer est `unref()`é pour ne pas
    // empêcher l'arrêt propre du process.
    const cleanup = setInterval(() => {
        const now = Date.now();
        for (const [key, bucket] of buckets) {
            if (bucket.resetAt <= now)
                buckets.delete(key);
        }
    }, Math.max(windowMs, 60000));
    cleanup.unref();
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
            const retryAfterSec = Math.ceil((bucket.resetAt - now) / 1000);
            res.setHeader('Retry-After', String(retryAfterSec));
            (0, response_1.sendError)(res, 'Trop de tentatives, réessayez plus tard', 429);
            return;
        }
        bucket.count += 1;
        next();
    };
};
exports.rateLimit = rateLimit;
