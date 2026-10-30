"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireOwnerApiKey = void 0;
const response_1 = require("../utils/response");
const apiKey_service_1 = require("../services/apiKey.service");
/**
 * Authentifie une intégration client avec une clé API en lecture seule.
 *
 * Une clé ne donne accès qu'aux véhicules de son propriétaire. Elle ne
 * permet aucune opération d'écriture, ne donne pas accès au compte et ne
 * peut pas lire les données internes de l'exploitation Faucon.
 */
const requireOwnerApiKey = async (req, res, next) => {
    try {
        const rawKey = (0, apiKey_service_1.extractApiKey)(req.headers);
        if (!rawKey) {
            (0, response_1.sendError)(res, 'Clé API manquante', 401);
            return;
        }
        const utilisateurId = await (0, apiKey_service_1.resolveApiKey)(rawKey);
        if (!utilisateurId) {
            (0, response_1.sendError)(res, 'Clé API invalide, révoquée ou expirée', 401);
            return;
        }
        req.user = {
            id: utilisateurId,
            email: '',
            userName: '',
        };
        next();
    }
    catch {
        (0, response_1.sendError)(res, 'Impossible de vérifier la clé API', 401);
    }
};
exports.requireOwnerApiKey = requireOwnerApiKey;
