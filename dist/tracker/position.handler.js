"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePosition = exports.handlePositionPayload = void 0;
const websocket_service_1 = require("../tracker/websocket.service");
const geofence_checker_1 = require("../tracker/geofence.checker");
const speed_checker_1 = require("../tracker/speed.checker");
const database_1 = require("../config/database");
const handlePositionPayload = async (vehiculeId, payload) => {
    try {
        // 1. Sauvegarder la position
        await database_1.prisma.position.create({
            data: {
                vehiculeId,
                latitude: payload.latitude,
                longitude: payload.longitude,
                vitesse: payload.vitesse,
                cap: payload.cap,
                niveauBatterie: payload.battery,
                statutACC: payload.acc ?? false,
                cyc: payload.cycleNumber,
                alr: payload.alertCount,
                horodatage: payload.timestamp,
            },
        });
        // 2. Mettre à jour la dernière communication du véhicule
        await database_1.prisma.vehicule.update({
            where: { id: vehiculeId },
            data: {
                derniereCommunication: payload.timestamp,
                niveauBatterie: payload.battery,
            },
        });
        // 3. Broadcast WebSocket vers le dashboard admin
        (0, websocket_service_1.broadcastPosition)(vehiculeId, {
            vehiculeId,
            latitude: payload.latitude,
            longitude: payload.longitude,
            vitesse: payload.vitesse,
            cap: payload.cap,
            battery: payload.battery,
            horodatage: payload.timestamp.toISOString(),
            source: payload.source,
            eventType: payload.eventType,
        });
        // 4. Vérifications asynchrones (ne bloquent pas la réponse au traceur)
        (0, geofence_checker_1.checkGeofence)(vehiculeId, payload.latitude, payload.longitude).catch(console.error);
        (0, speed_checker_1.checkSpeedLimit)(vehiculeId, payload.vitesse, payload.latitude, payload.longitude).catch(console.error);
        checkBatteryLevel(vehiculeId, payload.battery, payload.latitude, payload.longitude).catch(console.error);
        // 5. Événement transmis par les canaux HTTP/SMS (le canal TCP passe par
        // une trame EVENT dédiée, gérée par event.handler.ts).
        if (payload.eventType && payload.source !== 'tcp') {
            await recordEventAlarm(vehiculeId, payload.eventType, payload.latitude, payload.longitude, payload.timestamp);
        }
        console.log(`[POSITION] ${vehiculeId} → lat:${payload.latitude} lon:${payload.longitude} speed:${payload.vitesse}km/h source:${payload.source}`);
    }
    catch (err) {
        console.error(`[POSITION] Erreur sauvegarde :`, err);
        throw err;
    }
};
exports.handlePositionPayload = handlePositionPayload;
const handlePosition = async (trame, vehiculeId) => {
    await (0, exports.handlePositionPayload)(vehiculeId, {
        latitude: trame.lat,
        longitude: trame.lon,
        vitesse: trame.speed,
        cap: trame.cap,
        battery: trame.battery,
        timestamp: new Date(trame.ts),
        source: 'tcp',
        acc: trame.acc,
    });
};
exports.handlePosition = handlePosition;
const checkBatteryLevel = async (vehiculeId, battery, latitude, longitude) => {
    if (battery > 20)
        return;
    const vehicule = await database_1.prisma.vehicule.findUnique({
        where: { id: vehiculeId },
        select: { alarmes: { where: {
                    typeAlarme: 'BATTERIE_FAIBLE',
                    estAcquittee: false,
                    horodatage: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // dernière heure
                }, take: 1 } },
    });
    // Éviter les doublons d'alarmes batterie
    if (vehicule?.alarmes.length)
        return;
    await database_1.prisma.alarme.create({
        data: {
            vehiculeId,
            typeAlarme: 'BATTERIE_FAIBLE',
            latitude,
            longitude,
            valeurMesuree: battery,
            seuilConfigure: 20,
            horodatage: new Date(),
        },
    });
    console.warn(`[ALARM] BATTERIE_FAIBLE — ${vehiculeId} — ${battery}%`);
};
/**
 * Persiste et diffuse une alarme reçue via un canal qui ne transporte pas
 * de trame EVENT dédiée (HTTP webhook, SMS).
 */
const recordEventAlarm = async (vehiculeId, typeAlarme, latitude, longitude, horodatage) => {
    const alarme = await database_1.prisma.alarme.create({
        data: { vehiculeId, typeAlarme, latitude, longitude, horodatage },
    });
    (0, websocket_service_1.broadcastAlarm)(vehiculeId, {
        id: alarme.id,
        vehiculeId,
        typeAlarme,
        latitude,
        longitude,
        horodatage: alarme.horodatage.toISOString(),
    });
    console.warn(`[ALARM] ${typeAlarme} — ${vehiculeId} (source événement)`);
};
