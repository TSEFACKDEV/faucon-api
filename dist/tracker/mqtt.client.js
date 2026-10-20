"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMqttClient = exports.publishCommand = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const crypto_1 = __importDefault(require("crypto"));
const position_handler_1 = require("./position.handler");
const vehicle_lookup_service_1 = require("../services/vehicle-lookup.service");
const trame_validator_1 = require("./trame.validator");
const command_ack_handler_1 = require("./command-ack.handler");
const event_codes_1 = require("./event-codes");
let client = null;
// Clé HMAC-SHA256 partagée avec le firmware (CMD_SIGN_KEY dans le .ino).
// Utilisée pour signer les commandes descendantes et vérifier les ACK.
const CMD_SIGN_KEY = process.env.COMMAND_SIGNING_KEY ?? '';
const computeHmac = (data) => {
    if (!CMD_SIGN_KEY)
        return '';
    return crypto_1.default.createHmac('sha256', CMD_SIGN_KEY).update(data).digest('hex');
};
// ────────────────────────────────────────────────────────────────────────
// Canal « raw » (ce que publie réellement le firmware, cf. publierBrut dans
// l'ino) :
//   topic : faucon/<trackerId>/raw
//   payload : id;lat;lon;bat;spd;ts;evt;value;threshold;sat;sig;cap
//
//   - id          identifiant du traceur (trackerId, ex "FCN-0733")
//   - lat / lon   coordonnées GPS (degrés décimaux)
//   - bat         batterie en % (entier)
//   - spd         vitesse en km/h
//   - ts          horodatage UTC ISO 8601
//   - evt         code numérique d'événement (1..5), vide si aucun
//   - value/threshold  valeurs numériques de l'événement (0 si non renseigné)
//   - sat / sig / cap satellites, signal %, cap — optionnels, vides possible
//
//   Le firmware actuel (publierBrut, faucon_v12.ino) envoie TOUJOURS les 12
//   champs à position fixe — evt/value/threshold sont vides (";;;") plutôt
//   qu'omis quand il n'y a pas d'événement, idem pour sat/sig/cap absents.
//   12 champs = lecture par position fixe, sans ambiguïté possible. Pour
//   toute autre longueur (message tronqué/corrompu, ou ancien firmware qui
//   omettait vraiment des champs), on ne lit QUE le socle commun (id..ts) :
//   deviner evt/value/threshold vs sat/sig/cap depuis la fin est ambigu à 9
//   champs pile (les deux variantes ont le même nombre de champs) et
//   corrompt silencieusement sat/sig/cap avec des valeurs d'un autre champ.
const parseRawPayload = (payload) => {
    const parts = payload.split(';');
    if (parts.length < 6)
        return null;
    const read = (i) => {
        const v = parts[i];
        return v !== undefined && v.trim() !== '' ? v.trim() : undefined;
    };
    const core = {
        id: read(0), lat: read(1), lon: read(2),
        bat: read(3), spd: read(4), ts: read(5),
    };
    if (parts.length === 12) {
        return {
            ...core,
            evt: read(6), value: read(7), threshold: read(8),
            sat: read(9), sig: read(10), cap: read(11),
        };
    }
    if (parts.length !== 6) {
        console.warn(`[MQTT] Trame raw de longueur inattendue (${parts.length} champs) — seuls id/lat/lon/bat/spd/ts sont retenus : ${payload.slice(0, 120)}`);
    }
    return {
        ...core,
        evt: undefined, value: undefined, threshold: undefined,
        sat: undefined, sig: undefined, cap: undefined,
    };
};
const handleRawMessage = async (trackerId, payloadBuffer) => {
    const raw = parseRawPayload(payloadBuffer.toString());
    if (!raw || !raw.id || raw.lat === undefined || raw.lon === undefined || raw.bat === undefined) {
        console.warn(`[MQTT] Trame raw invalide pour ${trackerId} :`, payloadBuffer.toString().slice(0, 120));
        return;
    }
    const lat = Number(raw.lat);
    const lon = Number(raw.lon);
    const bat = Number(raw.bat);
    const spd = raw.spd !== undefined ? Number(raw.spd) : 0;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(bat)) {
        console.warn(`[MQTT] Champs non numériques pour ${trackerId}`);
        return;
    }
    if (!(0, trame_validator_1.isValidCoord)(lat, lon) || !(0, trame_validator_1.isValidBattery)(bat) || !(0, trame_validator_1.isValidSpeed)(spd)) {
        console.warn(`[MQTT] Valeurs hors plage pour ${trackerId} : lat=${lat} lon=${lon} bat=${bat} spd=${spd}`);
        return;
    }
    const device = await (0, vehicle_lookup_service_1.findVehiculeByIdentifier)(raw.id);
    if (!device) {
        console.warn(`[MQTT] Traceur inconnu : ${raw.id}`);
        return;
    }
    const ts = raw.ts ? new Date(raw.ts) : new Date();
    const capN = raw.cap !== undefined ? Number(raw.cap) : undefined;
    const satN = raw.sat !== undefined ? Number(raw.sat) : undefined;
    const sigN = raw.sig !== undefined ? Number(raw.sig) : undefined;
    await (0, position_handler_1.handlePositionPayload)(device.id, {
        latitude: lat,
        longitude: lon,
        vitesse: spd,
        cap: Number.isFinite(capN) ? capN : undefined,
        battery: bat,
        satellites: Number.isFinite(satN) ? satN : undefined,
        signal: Number.isFinite(sigN) ? sigN : undefined,
        timestamp: ts,
        source: 'mqtt',
        eventType: (0, event_codes_1.mapTrackerEvent)(raw.evt),
        eventValue: raw.value !== undefined ? Number(raw.value) : undefined,
        eventThreshold: raw.threshold !== undefined ? Number(raw.threshold) : undefined,
    });
    console.log(`[MQTT] Position raw traitée pour ${raw.id} (topic ${trackerId})`);
};
// Canal « data » : format JSON documenté pour un relais éventuel
// (ex. mqtt_relay.js) qui aurait déjà converti la trame brute en JSON.
//   topic : faucon/<trackerId>/data
//   payload : { "lat":4.09, "lon":9.80, "bat":85, "spd":12.3, "ts":"2026-...",
//               "sat":8, "sig":72, "cap":214.9, "evt":"2", "value":15, "threshold":20 }
const handleDataMessage = async (trackerId, payloadBuffer) => {
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
        eventType: (0, event_codes_1.mapTrackerEvent)(payload.evt),
        eventValue: payload.value !== undefined ? Number(payload.value) : undefined,
        eventThreshold: payload.threshold !== undefined ? Number(payload.threshold) : undefined,
    });
    console.log(`[MQTT] Position data traitée pour ${trackerId}`);
};
// Topic : faucon/<trackerId>/ack — réponse du traceur à une commande
// descendante. Payload attendu :
//   { "id": "<uuid CommandeDescendante>", "cmd": "...", "ok": true/false,
//     "detail": "...", "trackerId": "...", "sig": "<hmac-sha256>" }
const handleAckMessage = async (trackerId, payloadBuffer) => {
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
    // Vérification HMAC du ACK (signé par le firmware avec CMD_SIGN_KEY).
    // Le serveur vérifie que leACK vient bien du traceur légitime et n'a pas
    // été injecté par un subscriber MQTT malveillant.
    if (payload.sig && CMD_SIGN_KEY) {
        const aVerifier = `${payload.ok ? 1 : 0}|${payload.detail ?? ''}`;
        const sigCalculee = computeHmac(aVerifier);
        if (sigCalculee && payload.sig !== sigCalculee) {
            console.warn(`[MQTT] ACK falsifié pour ${trackerId} (cmd ${payload.id}) — signature invalide`);
            return;
        }
    }
    await (0, command_ack_handler_1.handleCommandAck)(payload.id, !!payload.ok, payload.detail ? String(payload.detail) : undefined);
};
// Publie une commande descendante vers un traceur. Retourne false si le
// canal MQTT n'est pas connecté (l'appelant doit alors marquer la
// commande FAILED plutôt que de la laisser PENDING indéfiniment).
const publishCommand = (trackerId, payload) => {
    if (!client || !client.connected)
        return false;
    // Signature HMAC : le firmware vérifie cette signature avant d'exécuter
    // la commande, pour empêcher l'injection par un subscriber MQTT
    // malveillant. Le payload signé est "cmd|valeur" (ou juste "cmd" si pas
    // de valeur).
    const aSigner = payload.valeur ? `${payload.cmd}|${payload.valeur}` : payload.cmd;
    const sig = computeHmac(aSigner);
    const signedPayload = { ...payload, sig };
    client.publish(`faucon/${trackerId}/cmd`, JSON.stringify(signedPayload), { qos: 1 });
    return true;
};
exports.publishCommand = publishCommand;
const startMqttClient = () => {
    const url = process.env.MQTT_BROKER_URL;
    if (!url) {
        // MQTT est le canal PRINCIPAL du firmware (HTTP/SMS ne sont que des
        // canaux de secours) — un oubli de configuration ici coupe l'essentiel
        // du flux temps réel silencieusement. Reste non-fatal (un déploiement
        // TCP/HTTP-only est possible) mais le signal doit être impossible à
        // manquer dans les logs de démarrage.
        console.error('╔═══════════════════════════════════════════════════════════════╗');
        console.error('║  [MQTT] MQTT_BROKER_URL absente — canal MQTT DÉSACTIVÉ.         ║');
        console.error('║  Le firmware publie principalement via MQTT : sans ce canal,    ║');
        console.error('║  seuls les canaux de secours HTTP/SMS resteront actifs.         ║');
        console.error('╚═══════════════════════════════════════════════════════════════╝');
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
        // `raw` = format natif du firmware ; `data` = JSON (relais éventuel).
        client.subscribe(['faucon/+/raw', 'faucon/+/data'], { qos: 1 }, (err) => {
            if (err)
                console.error('[MQTT] Erreur abonnement data/raw :', err);
            else
                console.log('[MQTT] Abonné à faucon/+/raw et faucon/+/data');
        });
        client.subscribe('faucon/+/ack', { qos: 1 }, (err) => {
            if (err)
                console.error('[MQTT] Erreur abonnement ack :', err);
            else
                console.log('[MQTT] Abonné à faucon/+/ack');
        });
    });
    client.on('message', (topic, payloadBuffer) => {
        // Topic : faucon/<trackerId>/<suffix> — le trackerId du canal est extrait
        // du topic ; pour le canal raw, l'identifiant relu dans le payload fait
        // foi (le firmware y répète l'identifiant du traceur).
        const parts = topic.split('/');
        const trackerId = parts.length >= 3 ? parts[1] : topic;
        if (topic.endsWith('/ack')) {
            handleAckMessage(trackerId, payloadBuffer).catch((err) => console.error('[MQTT] Erreur traitement ack :', err));
            return;
        }
        if (topic.endsWith('/raw')) {
            handleRawMessage(trackerId, payloadBuffer).catch((err) => console.error('[MQTT] Erreur traitement raw :', err));
            return;
        }
        handleDataMessage(trackerId, payloadBuffer).catch((err) => console.error('[MQTT] Erreur traitement data :', err));
    });
    client.on('error', (err) => console.error('[MQTT] Erreur connexion :', err));
    client.on('reconnect', () => console.log('[MQTT] Reconnexion en cours...'));
};
exports.startMqttClient = startMqttClient;
