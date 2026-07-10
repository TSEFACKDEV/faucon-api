"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const response_1 = require("../utils/response");
const position_handler_1 = require("../tracker/position.handler");
const vehicle_lookup_service_1 = require("../services/vehicle-lookup.service");
const router = (0, express_1.Router)();
const parseNumber = (value) => {
    if (value === undefined || value === null || value === '')
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const parseKeyValuePayload = (raw) => {
    const values = {};
    raw.split(/\r?\n|\s+/).forEach((segment) => {
        const [key, value] = segment.split('=');
        if (key && value) {
            values[key.trim()] = value.trim();
        }
    });
    return values;
};
/**
 * Accepte soit un timestamp epoch (secondes ou millisecondes, cf. contrat
 * TCP), soit une chaîne ISO 8601 (format documenté pour le webhook HTTP).
 * Retombe sur l'heure serveur uniquement si la valeur est absente/invalide.
 */
const parseTimestampParam = (value) => {
    if (value === undefined || value === null || value === '')
        return new Date();
    const raw = String(value);
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) {
        if (numeric < 1e9) {
            const date = new Date();
            date.setHours(0, 0, 0, 0);
            date.setSeconds(numeric);
            return date;
        }
        return new Date(numeric < 1e10 ? numeric * 1000 : numeric);
    }
    const parsedIso = new Date(raw);
    return Number.isNaN(parsedIso.getTime()) ? new Date() : parsedIso;
};
// Codes d'événement numériques utilisés par les canaux HTTP/SMS — doivent
// rester synchronisés avec l'enum Prisma TypeAlarme.
const EVENT_CODE_MAP = {
    '1': 'DECOLLEMENT_TRACEUR',
    '2': 'BATTERIE_FAIBLE',
    '3': 'VITESSE_EXCESSIVE',
    '4': 'SORTIE_ZONE',
    '5': 'NON_MOUVEMENT',
};
const mapTrackerEvent = (evt) => {
    if (evt === undefined || evt === null || evt === '')
        return undefined;
    return EVENT_CODE_MAP[String(evt)];
};
/**
 * Format clé=valeur (ex: id=...&lat=...&lon=...&bat=...).
 */
const parseSmsKeyValue = (raw) => {
    const values = parseKeyValuePayload(raw);
    if (!values.id || !values.lat || !values.lon || !values.bat)
        return null;
    return {
        deviceId: values.id,
        latitude: Number(values.lat),
        longitude: Number(values.lon),
        battery: Number(values.bat),
        event: values.evt,
        cycle: values.cyc ? Number(values.cyc) : undefined,
        alertCount: values.alr ? Number(values.alr) : undefined,
    };
};
/**
 * Format texte libre du traceur, ex :
 * "NORMAL FCN-0733 Pos: 4.0360,9.7622 Bat:12%"
 */
const parseSmsFreeText = (raw) => {
    const posMatch = raw.match(/Pos:\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
    const batMatch = raw.match(/Bat:\s*(\d+)\s*%?/i);
    const idMatch = raw.match(/\b([A-Z]{2,}-\d{2,})\b/i);
    if (!posMatch || !batMatch || !idMatch)
        return null;
    return {
        deviceId: idMatch[1],
        latitude: Number(posMatch[1]),
        longitude: Number(posMatch[2]),
        battery: Number(batMatch[1]),
        event: undefined,
        cycle: undefined,
        alertCount: undefined,
    };
};
const parseSmsPosition = (raw) => parseSmsKeyValue(raw) ?? parseSmsFreeText(raw);
router.post('/webhook', async (req, res) => {
    try {
        const id = req.query.id ?? req.query.trackerId ?? req.query.imei;
        const lat = parseNumber(req.query.lat);
        const lon = parseNumber(req.query.lon);
        const bat = parseNumber(req.query.bat);
        const speed = parseNumber(req.query.spd ?? req.query.speed);
        const cap = parseNumber(req.query.cap);
        const evt = req.query.evt;
        const cyc = parseNumber(req.query.cyc);
        const alr = parseNumber(req.query.alr);
        if (!id || lat === null || lon === null || bat === null) {
            return (0, response_1.sendError)(res, 'Paramètres webhook incomplets', 400);
        }
        const device = await (0, vehicle_lookup_service_1.findVehiculeByIdentifier)(String(id));
        if (!device) {
            return (0, response_1.sendError)(res, 'Device introuvable', 404);
        }
        await (0, position_handler_1.handlePositionPayload)(device.id, {
            latitude: lat,
            longitude: lon,
            vitesse: speed ?? 0,
            cap: cap ?? 0,
            battery: bat,
            timestamp: parseTimestampParam(req.query.ts),
            source: 'http',
            eventType: mapTrackerEvent(evt),
            cycleNumber: cyc ?? undefined,
            alertCount: alr ?? undefined,
        });
        return (0, response_1.sendSuccess)(res, 'Position reçue depuis le tracker', {
            deviceId: device.id,
            imei: device.imei,
            source: 'http',
        });
    }
    catch (error) {
        return (0, response_1.sendError)(res, error?.message ?? 'Erreur webhook', 500);
    }
});
router.post('/sms', async (req, res) => {
    try {
        const raw = typeof req.body?.text === 'string' ? req.body.text : '';
        if (!raw)
            return (0, response_1.sendError)(res, 'Texte SMS requis', 400);
        const parsed = parseSmsPosition(raw);
        if (!parsed)
            return (0, response_1.sendError)(res, 'Format SMS non reconnu', 400);
        const device = await (0, vehicle_lookup_service_1.findVehiculeByIdentifier)(parsed.deviceId);
        if (!device) {
            return (0, response_1.sendError)(res, 'Device introuvable', 404);
        }
        await (0, position_handler_1.handlePositionPayload)(device.id, {
            latitude: parsed.latitude,
            longitude: parsed.longitude,
            vitesse: 0,
            cap: 0,
            battery: parsed.battery,
            timestamp: new Date(),
            source: 'sms',
            eventType: parsed.event ? mapTrackerEvent(parsed.event) : undefined,
            cycleNumber: parsed.cycle,
            alertCount: parsed.alertCount,
        });
        return (0, response_1.sendSuccess)(res, 'Position reçue depuis le SMS', {
            deviceId: device.id,
            imei: device.imei,
            source: 'sms',
        });
    }
    catch (error) {
        return (0, response_1.sendError)(res, error?.message ?? 'Erreur SMS', 500);
    }
});
exports.default = router;
