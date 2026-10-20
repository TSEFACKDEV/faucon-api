"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasRecentUnacknowledgedAlarm = void 0;
const database_1 = require("../config/database");
// Évite de créer une alarme en double quand une alarme du même type, pour le
// même véhicule, non encore acquittée, existe déjà dans la fenêtre récente —
// une redélivrance MQTT/TCP, un capteur qui déclenche deux fois de suite, ou
// deux canaux redondants ne doivent pas générer deux alarmes distinctes.
// Même convention que geofence.checker.ts / speed.checker.ts.
const hasRecentUnacknowledgedAlarm = async (vehiculeId, typeAlarme, windowMs) => {
    const recent = await database_1.prisma.alarme.findFirst({
        where: {
            vehiculeId,
            typeAlarme,
            estAcquittee: false,
            horodatage: { gte: new Date(Date.now() - windowMs) },
        },
        select: { id: true },
    });
    return !!recent;
};
exports.hasRecentUnacknowledgedAlarm = hasRecentUnacknowledgedAlarm;
