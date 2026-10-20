"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePosition = exports.handlePositionPayload = void 0;
const websocket_service_1 = require("../tracker/websocket.service");
const geofence_checker_1 = require("../tracker/geofence.checker");
const speed_checker_1 = require("../tracker/speed.checker");
const database_1 = require("../config/database");
const alarm_dedup_1 = require("./alarm-dedup");
const handlePositionPayload = async (vehiculeId, payload) => {
    try {
        // Déduplication : une même trame peut arriver par plusieurs canaux
        // (firmware → `raw` ET relais → `data`, TCP + MQTT redondants) ou être
        // redélivrée (QoS 1). On ne persiste qu'une position par véhicule pour un
        // même horodatage (± 2 s), sinon l'historique et la trace sont faussés.
        //
        // Le contrôle (findFirst) puis l'écriture (create) ne sont pas atomiques
        // par nature : deux trames quasi simultanées pour le MÊME véhicule
        // peuvent toutes deux passer le contrôle avant qu'aucune n'ait committé
        // son insert. `pg_advisory_xact_lock` sérialise les écritures pour un
        // même véhicule (verrou tenu le temps de la transaction, relâché au
        // commit) sans verrouiller de ligne ni gêner les autres véhicules.
        const isNewPosition = await database_1.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtext(${vehiculeId})::bigint)`;
            const duplicate = await tx.position.findFirst({
                where: {
                    vehiculeId,
                    horodatage: {
                        gte: new Date(payload.timestamp.getTime() - 2000),
                        lte: new Date(payload.timestamp.getTime() + 2000),
                    },
                },
                select: { id: true },
            });
            if (duplicate)
                return false;
            // 1. Sauvegarder la position
            await tx.position.create({
                data: {
                    vehiculeId,
                    latitude: payload.latitude,
                    longitude: payload.longitude,
                    vitesse: payload.vitesse,
                    cap: payload.cap,
                    nbSatellites: payload.satellites,
                    niveauSignal: payload.signal,
                    niveauBatterie: payload.battery,
                    statutACC: payload.acc ?? false,
                    cyc: payload.cycleNumber,
                    alr: payload.alertCount,
                    horodatage: payload.timestamp,
                },
            });
            // 2. Mettre à jour la dernière communication du véhicule
            await tx.vehicule.update({
                where: { id: vehiculeId },
                data: {
                    derniereCommunication: payload.timestamp,
                    niveauBatterie: payload.battery,
                },
            });
            return true;
        });
        // Duplicata : on diffuse quand même en temps réel (le dashboard a besoin
        // de la fraîcheur) mais on ne crée pas de nouvelle rangée.
        if (!isNewPosition) {
            (0, websocket_service_1.broadcastPosition)(vehiculeId, {
                vehiculeId,
                latitude: payload.latitude,
                longitude: payload.longitude,
                vitesse: payload.vitesse,
                cap: payload.cap,
                battery: payload.battery,
                satellites: payload.satellites,
                signal: payload.signal,
                horodatage: payload.timestamp.toISOString(),
                source: payload.source,
                eventType: payload.eventType,
            });
            console.log(`[POSITION] ${vehiculeId} → duplicata ignoré (${payload.source})`);
            return;
        }
        // 3. Broadcast WebSocket vers le dashboard admin
        (0, websocket_service_1.broadcastPosition)(vehiculeId, {
            vehiculeId,
            latitude: payload.latitude,
            longitude: payload.longitude,
            vitesse: payload.vitesse,
            cap: payload.cap,
            battery: payload.battery,
            satellites: payload.satellites,
            signal: payload.signal,
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
            await recordEventAlarm(vehiculeId, payload.eventType, payload.latitude, payload.longitude, payload.timestamp, payload.eventValue, payload.eventThreshold);
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
        satellites: trame.sats,
        signal: trame.signal,
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
    (0, websocket_service_1.broadcastAlarm)(vehiculeId, {
        typeAlarme: 'BATTERIE_FAIBLE',
        latitude,
        longitude,
        horodatage: new Date().toISOString(),
    });
    console.warn(`[ALARM] BATTERIE_FAIBLE — ${vehiculeId} — ${battery}%`);
};
/**
 * Persiste et diffuse une alarme reçue via un canal qui ne transporte pas
 * de trame EVENT dédiée (HTTP webhook, SMS).
 */
const recordEventAlarm = async (vehiculeId, typeAlarme, latitude, longitude, horodatage, valeurMesuree, seuilConfigure) => {
    if (await (0, alarm_dedup_1.hasRecentUnacknowledgedAlarm)(vehiculeId, typeAlarme, 5 * 60 * 1000)) {
        return;
    }
    const alarme = await database_1.prisma.alarme.create({
        data: { vehiculeId, typeAlarme, latitude, longitude, horodatage, valeurMesuree, seuilConfigure },
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
