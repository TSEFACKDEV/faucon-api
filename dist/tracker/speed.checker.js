"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSpeedLimit = void 0;
const database_1 = require("../config/database");
const alarm_dedup_1 = require("./alarm-dedup");
const websocket_service_1 = require("./websocket.service");
const checkSpeedLimit = async (vehiculeId, speed, latitude, longitude) => {
    const limit = await database_1.prisma.limiteVitesse.findUnique({
        where: { vehiculeId },
    });
    if (!limit || !limit.estActive)
        return;
    if (speed <= limit.seuilKmh)
        return;
    if (await (0, alarm_dedup_1.hasRecentUnacknowledgedAlarm)(vehiculeId, 'VITESSE_EXCESSIVE', 60 * 1000)) {
        return;
    }
    const alarme = await database_1.prisma.alarme.create({
        data: {
            vehiculeId,
            typeAlarme: 'VITESSE_EXCESSIVE',
            latitude,
            longitude,
            valeurMesuree: speed,
            seuilConfigure: limit.seuilKmh,
            horodatage: new Date(),
        },
    });
    (0, websocket_service_1.broadcastAlarm)(vehiculeId, {
        id: alarme.id,
        vehiculeId,
        typeAlarme: 'VITESSE_EXCESSIVE',
        latitude,
        longitude,
        horodatage: alarme.horodatage.toISOString(),
    });
    console.warn(`[ALARM] VITESSE_EXCESSIVE — ${vehiculeId} — ${speed}km/h > seuil: ${limit.seuilKmh}km/h`);
};
exports.checkSpeedLimit = checkSpeedLimit;
