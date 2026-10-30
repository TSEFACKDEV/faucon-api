"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkGeofence = void 0;
const database_1 = require("../config/database");
const geo_1 = require("../utils/geo");
const alarm_dedup_1 = require("./alarm-dedup");
const websocket_service_1 = require("./websocket.service");
// Nombre minimum de satellites GPS pour qu'une position soit considérée
// fiable. En dessous, une alerte de sortie de zone est probablement un
// faux positif dû à une dérive GPS (ciel obstrué, tunnel, zone urbaine dense).
const MIN_SATELLITES_FOR_GEOFENCE = 4;
// Marge de sécurité (mètres) ajoutée au rayon du géofence pour éviter qu'une
// dérive GPS de quelques mètres ne déclenche une fausse alerte de sortie.
const GEOFENCE_HYSTERESIS_M = 10;
// Une sortie n'est signalée qu'une seule fois : au passage effectif de
// l'intérieur vers l'extérieur de la zone. Tant que le véhicule reste dehors,
// aucune nouvelle alarme n'est créée.
const checkGeofence = async (vehiculeId, lat, lon, satellites, // qualité GPS de la position courante
timestamp) => {
    const geofence = await database_1.prisma.perimetreGeofence.findUnique({
        where: { vehiculeId },
    });
    if (!geofence || !geofence.estActif)
        return;
    // Rejette les positions GPS trop imprécises pour une alarme de géofence.
    // Une dérive GPS peut faire apparaître une fausse sortie de zone.
    if (satellites != null && satellites < MIN_SATELLITES_FOR_GEOFENCE) {
        return;
    }
    const distance = (0, geo_1.haversineMeters)(lat, lon, geofence.centreLat, geofence.centreLon);
    // Applique une hysterèse : seule une position nettement au-delà du rayon
    // (plus la marge de sécurité) est considérée comme une vraie sortie.
    const effectiveRadius = geofence.rayonMetres + GEOFENCE_HYSTERESIS_M;
    const isOutside = distance > effectiveRadius;
    if (!isOutside)
        return;
    // Récupère la position précédant celle qui vient d'être enregistrée. On
    // filtre sur l'horodatage courant pour ne jamais comparer la position à
    // elle-même (elle est déjà insérée en base au moment de ce contrôle).
    const previousPosition = await database_1.prisma.position.findFirst({
        where: {
            vehiculeId,
            ...(timestamp ? { horodatage: { lt: timestamp } } : {}),
        },
        orderBy: { horodatage: 'desc' },
    });
    // Sans position précédente fiable, on ne déclenche pas : une première
    // trame isolée hors zone peut être une erreur de calibration du traceur.
    if (!previousPosition)
        return;
    const prevDistance = (0, geo_1.haversineMeters)(previousPosition.latitude, previousPosition.longitude, geofence.centreLat, geofence.centreLon);
    // Le véhicule était déjà dehors : c'est la continuation d'une sortie déjà
    // signalée, pas un nouvel événement. On évite ainsi les alertes répétées
    // toutes les cinq minutes tant que le véhicule reste hors zone.
    if (prevDistance > effectiveRadius)
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
