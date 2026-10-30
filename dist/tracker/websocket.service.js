"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.broadcastDiagnostic = exports.broadcastVehicleMode = exports.broadcastCommandUpdate = exports.broadcastAlarm = exports.broadcastPosition = exports.initWebSocket = void 0;
const socket_io_1 = require("socket.io");
const jwt_1 = require("../utils/jwt");
const database_1 = require("../config/database");
const cors_1 = require("../config/cors");
const apiKey_service_1 = require("../services/apiKey.service");
let io;
const initWebSocket = (httpServer) => {
    io = new socket_io_1.Server(httpServer, {
        cors: { origin: cors_1.corsOrigins, methods: ['GET', 'POST'], credentials: true },
    });
    // Authentification obligatoire à la connexion (le client passe déjà le
    // token dans `auth.token` — cf. client web et mobile — il manquait
    // seulement la vérification côté serveur).
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token || typeof token !== 'string') {
            return next(new Error('Authentification requise'));
        }
        try {
            // Une clé API propriétaire peut ouvrir le canal temps réel, en lecture
            // seule, sans donner accès aux routes internes.
            if (token.startsWith(apiKey_service_1.API_KEY_PREFIX)) {
                const utilisateurId = await (0, apiKey_service_1.resolveApiKey)(token);
                if (!utilisateurId)
                    return next(new Error('Clé API invalide'));
                socket.data.utilisateurId = utilisateurId;
                socket.data.role = 'UTILISATEUR';
                socket.data.scope = 'owner';
                next();
                return;
            }
            const payload = (0, jwt_1.verifyAccessToken)(token);
            socket.data.utilisateurId = payload.id;
            socket.data.role = payload.role;
            socket.data.scope = 'internal';
            next();
        }
        catch {
            next(new Error('Token invalide ou expiré'));
        }
    });
    io.on('connection', (socket) => {
        const utilisateurId = socket.data.utilisateurId;
        console.log(`[WS] Client connecté : ${socket.id} (user ${utilisateurId})`);
        // Un client ne peut s'abonner qu'aux véhicules qu'il possède — sauf un
        // ADMIN (dashboard web de supervision), qui voit tous les traceurs.
        socket.on('subscribe', async (vehiculeIds) => {
            if (!Array.isArray(vehiculeIds) || vehiculeIds.length === 0)
                return;
            // Limite stricte : un client ne peut pas s'abonner à plus de 50
            // véhicules en une seule requête. Au-delà, c'est probablement une
            // erreur côté client ou une tentative de surcharge du serveur.
            const MAX_SUBSCRIBE = 50;
            const ids = vehiculeIds.slice(0, MAX_SUBSCRIBE);
            const isAdmin = socket.data.role === 'ADMIN';
            const isOwnerScope = socket.data.scope === 'owner';
            const owned = isAdmin
                ? await database_1.prisma.vehicule.findMany({ where: { id: { in: ids } }, select: { id: true } })
                : await database_1.prisma.vehicule.findMany({
                    where: { id: { in: ids }, utilisateurId },
                    select: { id: true },
                });
            // Un client authentifié par clé API n'entre jamais dans la room
            // interne : il ne peut donc pas recevoir les diagnostics complets,
            // les commandes ni les données d'exploitation.
            owned.forEach(({ id }) => socket.join(isOwnerScope ? `owner-vehicle:${id}` : `vehicle:${id}`));
            console.log(`[WS] ${socket.id} abonné à ${owned.length}/${vehiculeIds.length} véhicule(s)`);
        });
        socket.on('disconnect', () => {
            console.log(`[WS] Client déconnecté : ${socket.id}`);
        });
    });
};
exports.initWebSocket = initWebSocket;
const broadcastPosition = (vehiculeId, data) => {
    if (!io)
        return;
    io.to(`vehicle:${vehiculeId}`)
        .to(`owner-vehicle:${vehiculeId}`)
        .emit('position_update', data);
};
exports.broadcastPosition = broadcastPosition;
const broadcastAlarm = (vehiculeId, data) => {
    if (!io)
        return;
    io.to(`vehicle:${vehiculeId}`)
        .to(`owner-vehicle:${vehiculeId}`)
        .emit('alarm', data);
};
exports.broadcastAlarm = broadcastAlarm;
// Notifie l'app mobile qu'une commande descendante (LOCALISER, MODE,
// REDEMARRER, RESET_USINE...) vient de changer de statut — envoyée,
// exécutée par le traceur, ou expirée.
const broadcastCommandUpdate = (vehiculeId, data) => {
    if (!io)
        return;
    io.to(`vehicle:${vehiculeId}`).emit('commande_update', data);
};
exports.broadcastCommandUpdate = broadcastCommandUpdate;
// Notifie l'app mobile du mode RÉELLEMENT appliqué par le traceur (confirmé
// par l'ACK d'une commande MODE ou MODE?). Émis uniquement quand le mode
// change — l'app n'a pas à le deviner ni à le redemander.
const broadcastVehicleMode = (vehiculeId, modeActuel) => {
    if (!io)
        return;
    // Le mode est un état public du véhicule : utile aux propriétaires.
    io.to(`vehicle:${vehiculeId}`)
        .to(`owner-vehicle:${vehiculeId}`)
        .emit('vehicle_mode', { vehiculeId, modeActuel });
};
exports.broadcastVehicleMode = broadcastVehicleMode;
// Notifie l'app mobile du dernier diagnostic reçu du traceur (canal
// faucon/<trackerId>/diag, toutes les 5 minutes) : modèle, version du
// firmware, compteurs de reset, santé I2C, file d'attente du journal
// flash, mémoire libre. Permet d'afficher l'état réel du boîtier sans
// interroger le traceur.
const broadcastDiagnostic = (vehiculeId, data) => {
    if (!io)
        return;
    io.to(`vehicle:${vehiculeId}`).emit('diagnostic_update', data);
};
exports.broadcastDiagnostic = broadcastDiagnostic;
