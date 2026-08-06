"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendCommandToTracker = exports.startTcpServer = void 0;
const net_1 = __importDefault(require("net"));
const trame_parser_1 = require("./trame.parser");
const trame_validator_1 = require("./trame.validator");
const position_handler_1 = require("./position.handler");
const heartbeat_handler_1 = require("./heartbeat.handler");
const event_handler_1 = require("./event.handler");
const vehicle_lookup_service_1 = require("../services/vehicle-lookup.service");
const TCP_PORT = Number(process.env.TCP_PORT ?? 5000);
// Map des connexions actives : imei → socket
const activeConnections = new Map();
const getVehiculeId = async (identifier) => {
    const vehicule = await (0, vehicle_lookup_service_1.findVehiculeByIdentifier)(identifier);
    return vehicule?.id ?? null;
};
const sendResponse = (socket, status, message) => {
    const response = JSON.stringify({ status, message, ts: Date.now() }) + '\n';
    socket.write(response);
};
const startTcpServer = () => {
    const server = net_1.default.createServer((socket) => {
        const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
        console.log(`[TCP] Nouvelle connexion : ${clientAddr}`);
        let buffer = '';
        let trackerIdentifier = null;
        // Timeout : ferme la connexion si aucune donnée en 5 minutes
        socket.setTimeout(5 * 60 * 1000);
        socket.on('data', async (data) => {
            buffer += data.toString('utf8');
            // Traitement ligne par ligne (délimiteur \n)
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? ''; // Garde le fragment incomplet
            const trames = (0, trame_parser_1.parseTrame)(lines.join('\n'));
            for (const trame of trames) {
                // Validation
                const { valid, reason } = (0, trame_validator_1.validateTrame)(trame);
                if (!valid) {
                    console.warn(`[TCP] Trame invalide depuis ${clientAddr} : ${reason}`);
                    sendResponse(socket, 'ERROR', reason);
                    continue;
                }
                // Vérifier que l'identifiant (imei|trackerId) est enregistré en base
                const vehiculeId = await getVehiculeId(trame.imei);
                if (!vehiculeId) {
                    console.warn(`[TCP] Traceur non enregistré : ${trame.imei}`);
                    sendResponse(socket, 'ERROR', 'Traceur non enregistré');
                    continue;
                }
                // Mémoriser l'identifiant de ce socket
                if (!trackerIdentifier) {
                    trackerIdentifier = trame.imei;
                    activeConnections.set(trame.imei, socket);
                }
                try {
                    // Router selon le type de trame
                    switch (trame.type) {
                        case 'POSITION':
                            await (0, position_handler_1.handlePosition)(trame, vehiculeId);
                            break;
                        case 'EVENT':
                            await (0, event_handler_1.handleEvent)(trame, vehiculeId);
                            break;
                        case 'HEARTBEAT':
                            await (0, heartbeat_handler_1.handleHeartbeat)(trame, vehiculeId);
                            break;
                    }
                    sendResponse(socket, 'OK');
                }
                catch (err) {
                    console.error(`[TCP] Erreur traitement trame :`, err);
                    sendResponse(socket, 'ERROR', 'Erreur serveur');
                }
            }
        });
        socket.on('timeout', () => {
            console.log(`[TCP] Timeout connexion : ${clientAddr}`);
            socket.destroy();
        });
        socket.on('close', () => {
            console.log(`[TCP] Connexion fermée : ${clientAddr}`);
            if (trackerIdentifier)
                activeConnections.delete(trackerIdentifier);
        });
        socket.on('error', (err) => {
            console.error(`[TCP] Erreur socket ${clientAddr} :`, err.message);
        });
    });
    server.listen(TCP_PORT, () => {
        console.log(`📡 TCP Listener démarré sur le port ${TCP_PORT}`);
    });
    server.on('error', (err) => {
        console.error(`[TCP] Erreur serveur :`, err);
    });
    return server;
};
exports.startTcpServer = startTcpServer;
// Envoyer une commande à un traceur connecté
const sendCommandToTracker = (imei, command) => {
    const socket = activeConnections.get(imei);
    if (!socket || socket.destroyed)
        return false;
    const cmd = JSON.stringify(command) + '\n';
    socket.write(cmd);
    console.log(`[TCP] Commande envoyée à ${imei} :`, command);
    return true;
};
exports.sendCommandToTracker = sendCommandToTracker;
