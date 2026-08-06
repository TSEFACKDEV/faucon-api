"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMqttClient = exports.publishCommand = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const position_handler_1 = require("./position.handler");
const vehicle_lookup_service_1 = require("../services/vehicle-lookup.service");
const trame_validator_1 = require("./trame.validator");
const command_ack_handler_1 = require("./command-ack.handler");
// Mêmes codes que les canaux HTTP/SMS — un traceur MQTT envoie donc
// exactement le même format de champ "evt" (numérique), pas de nouvelle
// convention à maintenir.
const EVENT_CODE_MAP = {
    '1': 'DECOLLEMENT_TRACEUR',
    '2': 'BATTERIE_FAIBLE',
    '3': 'VITESSE_EXCESSIVE',
    '4': 'SORTIE_ZONE',
    '5': 'NON_MOUVEMENT',
};
let client = null;
// Topic attendu : faucon/<trackerId>/data
// Payload JSON attendu (mêmes champs que le webhook HTTP, en JSON plutôt
// qu'en query string) :
//   { "lat":4.09, "lon":9.80, "bat":85, "spd":12.3, "ts":"2026-...",
//     "sat":8, "sig":72, "cap":214.9,
//     "evt":"2", "value":15, "threshold":20 }
//   sat/sig/cap/evt/value/threshold optionnels — sat = nb satellites GPS
//   captés, sig = qualité du signal réseau en % (0-100, déjà normalisée par
//   le firmware), cap = direction en degrés (0-359.9, absent la plupart du
//   temps à l'arrêt — le GPS ne peut pas calculer de cap sans déplacement).
const handleMessage = async (topic, payloadBuffer) => {
    const trackerId = topic.split('/')[1];
    if (!trackerId)
        return;
    let payload;
    try {
        payload = JSON.parse(payloadBuffer.toString());
    }
    catch {
        console.warn(`[MQTT] Payload JSON invalide pour ${trackerId}`);
        return;
    }
    const lat = Number(payload.lat);
    const lon = Number(payload.lon);
    const bat = Number(payload.bat);
    const spd = payload.spd !== undefined ? Number(payload.spd) : 0;
    const ts = payload.ts ? new Date(payload.ts) : new Date();
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(bat)) {
        console.warn(`[MQTT] Champs manquants/non numériques pour ${trackerId}`);
        return;
    }
    if (!(0, trame_validator_1.isValidCoord)(lat, lon) || !(0, trame_validator_1.isValidBattery)(bat) || !(0, trame_validator_1.isValidSpeed)(spd)) {
        console.warn(`[MQTT] Valeurs hors plage pour ${trackerId} : lat=${lat} lon=${lon} bat=${bat} spd=${spd}`);
        return;
    }
    const device = await (0, vehicle_lookup_service_1.findVehiculeByIdentifier)(trackerId);
    if (!device) {
        console.warn(`[MQTT] Traceur inconnu : ${trackerId}`);
        return;
    }
    const evt = payload.evt !== undefined ? EVENT_CODE_MAP[String(payload.evt)] : undefined;
    const sat = payload.sat !== undefined ? Number(payload.sat) : undefined;
    const sig = payload.sig !== undefined ? Number(payload.sig) : undefined;
    const cap = payload.cap !== undefined ? Number(payload.cap) : undefined;
    await (0, position_handler_1.handlePositionPayload)(device.id, {
        latitude: lat,
        longitude: lon,
        vitesse: spd,
        cap: Number.isFinite(cap) ? cap : undefined,
        battery: bat,
        satellites: Number.isFinite(sat) ? sat : undefined,
        signal: Number.isFinite(sig) ? sig : undefined,
        timestamp: ts,
        source: 'mqtt',
        eventType: evt,
        eventValue: payload.value !== undefined ? Number(payload.value) : undefined,
        eventThreshold: payload.threshold !== undefined ? Number(payload.threshold) : undefined,
    });
    console.log(`[MQTT] Position traitée pour ${trackerId} (topic ${topic})`);
};
// Topic : faucon/<trackerId>/ack — réponse du traceur à une commande
// descendante (cf. commandTracker.service.ts). Payload attendu :
//   { "id": "<uuid CommandeDescendante>", "cmd": "...", "ok": true/false,
//     "detail": "..." }
const handleAckMessage = async (topic, payloadBuffer) => {
    const trackerId = topic.split('/')[1];
    if (!trackerId)
        return;
    let payload;
    try {
        payload = JSON.parse(payloadBuffer.toString());
    }
    catch {
        console.warn(`[MQTT] Accusé de commande JSON invalide pour ${trackerId}`);
        return;
    }
    if (!payload.id || typeof payload.id !== 'string')
        return;
    await (0, command_ack_handler_1.handleCommandAck)(payload.id, !!payload.ok, payload.detail ? String(payload.detail) : undefined);
};
// Publie une commande descendante vers un traceur. Retourne false si le
// canal MQTT n'est pas connecté (l'appelant doit alors marquer la
// commande FAILED plutôt que de la laisser PENDING indéfiniment).
const publishCommand = (trackerId, payload) => {
    if (!client || !client.connected)
        return false;
    client.publish(`faucon/${trackerId}/cmd`, JSON.stringify(payload), { qos: 1 });
    return true;
};
exports.publishCommand = publishCommand;
const startMqttClient = () => {
    const url = process.env.MQTT_BROKER_URL;
    if (!url) {
        console.warn('[MQTT] MQTT_BROKER_URL absente — canal MQTT désactivé');
        return;
    }
    client = mqtt_1.default.connect(url, {
        username: process.env.MQTT_BACKEND_USERNAME,
        password: process.env.MQTT_BACKEND_PASSWORD,
        clientId: `faucon-backend-${Math.random().toString(16).slice(2)}`,
        reconnectPeriod: 5000,
    });
    client.on('connect', () => {
        console.log('📡 MQTT connecté au broker');
        client.subscribe('faucon/+/data', { qos: 1 }, (err) => {
            if (err)
                console.error('[MQTT] Erreur abonnement :', err);
            else
                console.log('[MQTT] Abonné à faucon/+/data');
        });
        client.subscribe('faucon/+/ack', { qos: 1 }, (err) => {
            if (err)
                console.error('[MQTT] Erreur abonnement ack :', err);
            else
                console.log('[MQTT] Abonné à faucon/+/ack');
        });
    });
    client.on('message', (topic, payloadBuffer) => {
        if (topic.endsWith('/ack')) {
            handleAckMessage(topic, payloadBuffer).catch((err) => console.error('[MQTT] Erreur traitement ack :', err));
            return;
        }
        handleMessage(topic, payloadBuffer).catch((err) => console.error('[MQTT] Erreur traitement :', err));
    });
    client.on('error', (err) => console.error('[MQTT] Erreur connexion :', err));
    client.on('reconnect', () => console.log('[MQTT] Reconnexion en cours...'));
};
exports.startMqttClient = startMqttClient;
