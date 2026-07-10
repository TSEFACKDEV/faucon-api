"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireProvisioningKey = void 0;
const response_1 = require("../utils/response");
/**
 * Protège les routes internes d'exploitation (provisioning en série) par une
 * clé API statique plutôt qu'un compte utilisateur — cet outil est utilisé
 * par l'équipe, pas par les clients, il n'y a pas encore de notion de rôle.
 */
const requireProvisioningKey = (req, res, next) => {
    const expected = process.env.PROVISIONING_API_KEY;
    if (!expected) {
        (0, response_1.sendError)(res, 'Provisioning désactivé (PROVISIONING_API_KEY absente)', 503);
        return;
    }
    const provided = req.headers['x-provisioning-key'];
    if (provided !== expected) {
        (0, response_1.sendError)(res, 'Clé de provisioning invalide', 401);
        return;
    }
    next();
};
exports.requireProvisioningKey = requireProvisioningKey;
