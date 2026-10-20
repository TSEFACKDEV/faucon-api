"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleEvent = void 0;
const websocket_service_1 = require("./websocket.service");
const database_1 = require("../config/database");
const alarm_dedup_1 = require("./alarm-dedup");
const handleEvent = async (trame, vehiculeId) => {
    try {
        if (await (0, alarm_dedup_1.hasRecentUnacknowledgedAlarm)(vehiculeId, trame.event, 5 * 60 * 1000)) {
            return;
        }
        const alarme = await database_1.prisma.alarme.create({
            data: {
                vehiculeId,
                typeAlarme: trame.event,
                latitude: trame.lat,
                longitude: trame.lon,
                valeurMesuree: trame.value,
                seuilConfigure: trame.threshold,
                horodatage: new Date(trame.ts),
            },
        });
        // Broadcast WebSocket immédiat
        (0, websocket_service_1.broadcastAlarm)(vehiculeId, {
            id: alarme.id,
            vehiculeId,
            typeAlarme: trame.event,
            latitude: trame.lat,
            longitude: trame.lon,
            horodatage: alarme.horodatage.toISOString(),
        });
        console.warn(`[EVENT] ${trame.event} — ${trame.imei}`);
    }
    catch (err) {
        console.error(`[EVENT] Erreur :`, err);
        throw err;
    }
};
exports.handleEvent = handleEvent;
