"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseTrame = void 0;
/**
 * Parse une chaîne JSON reçue sur TCP en Trame typée.
 * Gère les trames multiples séparées par \n dans un même buffer.
 */
const parseTrame = (raw) => {
    const results = [];
    // Un buffer TCP peut contenir plusieurs trames séparées par \n
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
        try {
            const parsed = JSON.parse(line);
            // Normalize identifier: some trackers send `id` or `trackerId` instead of `imei`
            parsed.imei = parsed.imei ?? parsed.id ?? parsed.trackerId;
            if (!parsed.type || !parsed.imei || !parsed.ts) {
                console.warn(`[PARSER] Trame ignorée — champs obligatoires manquants :`, line);
                continue;
            }
            if (!['POSITION', 'EVENT', 'HEARTBEAT'].includes(parsed.type)) {
                console.warn(`[PARSER] Type inconnu : ${parsed.type}`);
                continue;
            }
            results.push(parsed);
        }
        catch {
            console.warn(`[PARSER] JSON invalide reçu :`, line);
        }
    }
    return results;
};
exports.parseTrame = parseTrame;
