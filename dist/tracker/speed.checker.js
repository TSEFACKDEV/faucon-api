"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSpeedLimit = void 0;
const database_1 = require("../config/database");
const checkSpeedLimit = async (vehiculeId, speed, latitude, longitude) => {
    const limit = await database_1.prisma.limiteVitesse.findUnique({
        where: { vehiculeId },
    });
    if (!limit || !limit.estActive)
        return;
    if (speed <= limit.seuilKmh)
        return;
    // Éviter les doublons dans la même minute
    const recent = await database_1.prisma.alarme.findFirst({
        where: {
            vehiculeId,
            typeAlarme: 'VITESSE_EXCESSIVE',
            estAcquittee: false,
            horodatage: { gte: new Date(Date.now() - 60 * 1000) },
        },
    });
    if (recent)
        return;
    await database_1.prisma.alarme.create({
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
    console.warn(`[ALARM] VITESSE_EXCESSIVE — ${vehiculeId} — ${speed}km/h > seuil: ${limit.seuilKmh}km/h`);
};
exports.checkSpeedLimit = checkSpeedLimit;
