"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiKeyController = void 0;
const database_1 = require("../config/database");
const response_1 = require("../utils/response");
const apiKey_service_1 = require("../services/apiKey.service");
const MAX_ACTIVE_KEYS = 10;
const publicKeyFields = {
    id: true,
    nom: true,
    prefix: true,
    scopes: true,
    estActive: true,
    dateCreation: true,
    derniereUtilisation: true,
    dateExpiration: true,
};
exports.apiKeyController = {
    /** Liste les clés du compte, sans jamais révéler le secret. */
    list: async (req, res) => {
        try {
            const keys = await database_1.prisma.cleApi.findMany({
                where: { utilisateurId: req.user.id },
                orderBy: { dateCreation: 'desc' },
                select: publicKeyFields,
            });
            return (0, response_1.sendSuccess)(res, 'Clés API récupérées', keys);
        }
        catch {
            return (0, response_1.sendError)(res, 'Impossible de récupérer les clés API', 400);
        }
    },
    /** Crée une clé en lecture seule. Le secret n'est affiché qu'une fois. */
    create: async (req, res) => {
        try {
            const nom = String(req.body?.nom ?? '').trim();
            if (nom.length < 2 || nom.length > 60) {
                return (0, response_1.sendError)(res, 'Nom de clé requis (2 à 60 caractères)', 400);
            }
            const activeCount = await database_1.prisma.cleApi.count({
                where: { utilisateurId: req.user.id, estActive: true },
            });
            if (activeCount >= MAX_ACTIVE_KEYS) {
                return (0, response_1.sendError)(res, `Limite de ${MAX_ACTIVE_KEYS} clés actives atteinte. Révoquez une ancienne clé.`, 409);
            }
            const generated = (0, apiKey_service_1.generateApiKey)();
            const created = await database_1.prisma.cleApi.create({
                data: {
                    utilisateurId: req.user.id,
                    nom,
                    prefix: generated.prefix,
                    hash: generated.hash,
                    scopes: [apiKey_service_1.OWNER_SCOPE],
                },
                select: publicKeyFields,
            });
            return (0, response_1.sendSuccess)(res, 'Clé API créée. Copiez-la maintenant : elle ne sera plus affichée.', { ...created, key: generated.plain }, 201);
        }
        catch {
            return (0, response_1.sendError)(res, 'Impossible de créer la clé API', 400);
        }
    },
    /** Révoque immédiatement une clé (les intégrations en cours reçoivent 401). */
    revoke: async (req, res) => {
        try {
            const id = String(req.params.id ?? '');
            if (!id)
                return (0, response_1.sendError)(res, 'ID de clé requis', 400);
            const key = await database_1.prisma.cleApi.findFirst({
                where: { id, utilisateurId: req.user.id },
                select: { id: true },
            });
            if (!key)
                return (0, response_1.sendError)(res, 'Clé API introuvable', 404);
            await database_1.prisma.cleApi.update({
                where: { id: key.id },
                data: { estActive: false },
            });
            return (0, response_1.sendSuccess)(res, 'Clé API révoquée');
        }
        catch {
            return (0, response_1.sendError)(res, 'Impossible de révoquer la clé API', 400);
        }
    },
};
