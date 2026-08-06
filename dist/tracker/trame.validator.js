"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTrame = exports.isValidBattery = exports.isValidSpeed = exports.isValidCoord = void 0;
// Exportées pour être réutilisées par les canaux HTTP/SMS (tracker.routes.ts),
// qui doivent appliquer les mêmes bornes que le canal TCP plutôt que d'avoir
// leur propre logique de validation divergente.
const isValidCoord = (lat, lon) => lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
exports.isValidCoord = isValidCoord;
const isValidSpeed = (speed) => speed >= 0 && speed <= 300;
exports.isValidSpeed = isValidSpeed;
const isValidBattery = (battery) => battery >= 0 && battery <= 100;
exports.isValidBattery = isValidBattery;
const isValidIdentifier = (id) => /^\d{15}$/.test(id) || /^[A-Z0-9\-]{5,30}$/i.test(id);
const validateTrame = (trame) => {
    if (!isValidIdentifier(trame.imei)) {
        return { valid: false, reason: `Identifiant traceur invalide : ${trame.imei}` };
    }
    if (trame.type === 'POSITION') {
        const t = trame;
        if (!(0, exports.isValidCoord)(t.lat, t.lon)) {
            return { valid: false, reason: `Coordonnées invalides : ${t.lat}, ${t.lon}` };
        }
        if (!(0, exports.isValidSpeed)(t.speed)) {
            return { valid: false, reason: `Vitesse invalide : ${t.speed}` };
        }
        if (!(0, exports.isValidBattery)(t.battery)) {
            return { valid: false, reason: `Batterie invalide : ${t.battery}` };
        }
    }
    if (trame.type === 'EVENT') {
        const t = trame;
        const validEvents = [
            'SORTIE_ZONE', 'VITESSE_EXCESSIVE',
            'DECOLLEMENT_TRACEUR', 'NON_MOUVEMENT', 'BATTERIE_FAIBLE'
        ];
        if (!validEvents.includes(t.event)) {
            return { valid: false, reason: `Événement inconnu : ${t.event}` };
        }
        if (!(0, exports.isValidCoord)(t.lat, t.lon)) {
            return { valid: false, reason: `Coordonnées invalides` };
        }
    }
    // Horodatage : signaler les trames trop anciennes (> 10 min), sans les
    // rejeter (cas fréquent en zone de couverture réseau intermittente).
    const trameTime = new Date(trame.ts).getTime();
    const age = Number.isNaN(trameTime) ? 0 : Date.now() - trameTime;
    if (age > 10 * 60 * 1000) {
        console.warn(`[VALIDATOR] Trame ancienne (${Math.round(age / 1000)}s) — acceptée quand même (zone morte)`);
    }
    return { valid: true };
};
exports.validateTrame = validateTrame;
