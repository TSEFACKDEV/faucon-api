"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCommandAck = void 0;
const database_1 = require("../config/database");
const websocket_service_1 = require("./websocket.service");
const MODES_VALIDES = ['WORK', 'MOVE', 'STANDBY'];
const estModeValide = (valeur) => typeof valeur === 'string' && MODES_VALIDES.includes(valeur);
// Traite l'accusé de réception MQTT d'une commande descendante (cf.
// commandTracker.service.ts / mqtt.client.ts:handleAckMessage). `commandeId`
// est l'identifiant de la ligne CommandeDescendante que le firmware a
// recopié tel quel dans son message — c'est ce qui permet de retrouver la
// bonne commande sans ambiguïté, même si plusieurs sont en attente.
const handleCommandAck = async (commandeId, ok, detail) => {
    const commande = await database_1.prisma.commandeDescendante.findUnique({ where: { id: commandeId } });
    if (!commande) {
        console.warn(`[CMD] Accusé reçu pour une commande inconnue : ${commandeId}`);
        return;
    }
    // Déjà résolue (par exemple marquée TIMEOUT par le cron entre-temps) :
    // un accusé tardif ne doit pas écraser ce statut.
    if (commande.statutExecution !== 'PENDING')
        return;
    const parametresExistants = commande.parametres && typeof commande.parametres === 'object'
        ? commande.parametres
        : {};
    const updated = await database_1.prisma.commandeDescendante.update({
        where: { id: commandeId },
        data: {
            statutExecution: ok ? 'SUCCESS' : 'FAILED',
            dateReponse: new Date(),
            ...(detail ? { parametres: { ...parametresExistants, detail } } : {}),
        },
    });
    // Un ACK de MODE / MODE? porte le mode réellement appliqué par le traceur
    // dans `detail`. On resynchronise la base avec cette valeur : c'est la
    // seule source de vérité (la base pouvait être optimiste après un envoi
    // resté sans réponse, ou périmée après un reset du traceur). Les autres
    // commandes ne touchont pas au mode.
    if (ok &&
        (commande.codeCommande === 'MODE' || commande.codeCommande === 'MODE?') &&
        estModeValide(detail)) {
        await database_1.prisma.vehicule.update({
            where: { id: commande.vehiculeId },
            data: { modeActuel: detail },
        });
        (0, websocket_service_1.broadcastVehicleMode)(commande.vehiculeId, detail);
        console.log(`[CMD] Mode resynchronisé pour le véhicule ${commande.vehiculeId} : ${detail}`);
    }
    (0, websocket_service_1.broadcastCommandUpdate)(commande.vehiculeId, updated);
    console.log(`[CMD] Accusé traité : ${commande.codeCommande} (${commandeId}) -> ${updated.statutExecution}`);
};
exports.handleCommandAck = handleCommandAck;
