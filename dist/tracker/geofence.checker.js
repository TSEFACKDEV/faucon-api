"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkGeofence = void 0;
const database_1 = require("../config/database");
const geo_1 = require("../utils/geo");
const alarm_dedup_1 = require("./alarm-dedup");
const websocket_service_1 = require("./websocket.service");
const checkGeofence = async (vehiculeId, lat, lon) => {
    const geofence = await database_1.prisma.perimetreGeofence.findUnique({
        where: { vehiculeId },
    });
    if (!geofence || !geofence.estActif)
        return;
    const distance = (0, geo_1.haversineMeters)(lat, lon, geofence.centreLat, geofence.centreLon);
    const isOutside = distance > geofence.rayonMetres;
    if (!isOutside)
        return;
    if (await (0, alarm_dedup_1.hasRecentUnacknowledgedAlarm)(vehiculeId, 'SORTIE_ZONE', 5 * 60 * 1000)) {
        return;
    }
    const alarme = await database_1.prisma.alarme.create({
        data: {
            vehiculeId,
            typeAlarme: 'SORTIE_ZONE',
            latitude: lat,
            longitude: lon,
            valeurMesuree: Math.round(distance),
            seuilConfigure: geofence.rayonMetres,
            horodatage: new Date(),
        },
    });
    (0, websocket_service_1.broadcastAlarm)(vehiculeId, {
        id: alarme.id,
        vehiculeId,
        typeAlarme: 'SORTIE_ZONE',
        latitude: lat,
        longitude: lon,
        horodatage: alarme.horodatage.toISOString(),
    });
    console.warn(`[ALARM] SORTIE_ZONE — ${vehiculeId} — distance: ${Math.round(distance)}m > rayon: ${geofence.rayonMetres}m`);
};
exports.checkGeofence = checkGeofence;
