"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSpeedLimit = void 0;
const database_1 = require("../config/database");
const alarm_dedup_1 = require("./alarm-dedup");
const websocket_service_1 = require("./websocket.service");
// Vitesse maximale réaliste (km/h) au-delà de laquelle une mesure GPS est
// considérée comme aberrante (pic de bruit, multipath, tunnel).
const MAX_REALISTIC_SPEED_KMH = 180;
// Fenêtre pendant laquelle deux mesures consécutives doivent dépasser le
// seuil pour confirmer une vitesse excessive (évite les pics GPS isolés).
const SPEED_CONFIRMATION_WINDOW_MS = 10 * 60 * 1000;
const checkSpeedLimit = async (vehiculeId, speed, latitude, longitude, satellites, // qualité GPS de la position courante
timestamp) => {
    const limit = await database_1.prisma.limiteVitesse.findUnique({
        where: { vehiculeId },
    });
    if (!limit || !limit.estActive)
        return;
    // Rejette les vitesses aberrantes (probablement du bruit GPS).
    if (speed > MAX_REALISTIC_SPEED_KMH) {
        return;
    }
    if (speed <= limit.seuilKmh)
        return;
    // Rejette les positions avec un GPS trop imprécis pour une alarme de vitesse.
    if (satellites != null && satellites < 4) {
        return;
    }
    // Vérifie que la position précédente était également au-dessus du seuil
    // (évite le déclenchement sur un pic instantané). On exclut la position
    // courante, déjà insérée en base, et on exige qu'elle soit récente.
    const previousPosition = await database_1.prisma.position.findFirst({
        where: {
            vehiculeId,
            horodatage: {
                ...(timestamp ? { lt: timestamp } : {}),
                gte: new Date(Date.now() - SPEED_CONFIRMATION_WINDOW_MS),
            },
        },
        orderBy: { horodatage: 'desc' },
    });
    if (!previousPosition)
        return;
    if (previousPosition.vitesse <= limit.seuilKmh) {
        // Première mesure au-dessus du seuil : attend la confirmation
        // de la prochaine position avant de créer l'alarme.
        return;
    }
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
