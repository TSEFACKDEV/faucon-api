"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkGeofence = void 0;
const database_1 = require("../config/database");
const geo_1 = require("../utils/geo");
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
    // Vérifier qu'il n'y a pas déjà une alarme non acquittée récente
    const recent = await database_1.prisma.alarme.findFirst({
        where: {
            vehiculeId,
            typeAlarme: 'SORTIE_ZONE',
            estAcquittee: false,
            horodatage: { gte: new Date(Date.now() - 5 * 60 * 1000) }, // 5 min
        },
    });
    if (recent)
        return;
    await database_1.prisma.alarme.create({
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
    console.warn(`[ALARM] SORTIE_ZONE — ${vehiculeId} — distance: ${Math.round(distance)}m > rayon: ${geofence.rayonMetres}m`);
};
exports.checkGeofence = checkGeofence;
