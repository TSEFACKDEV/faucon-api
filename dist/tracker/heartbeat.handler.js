"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleHeartbeat = void 0;
const database_1 = require("../config/database");
const handleHeartbeat = async (trame, vehiculeId) => {
    await database_1.prisma.vehicule.update({
        where: { id: vehiculeId },
        data: {
            niveauBatterie: trame.battery,
            modeActuel: trame.mode,
            derniereCommunication: new Date(trame.ts),
        },
    });
    console.log(`[HEARTBEAT] ${trame.imei} — bat:${trame.battery}% mode:${trame.mode} rssi:${trame.rssi}dBm`);
};
exports.handleHeartbeat = handleHeartbeat;
