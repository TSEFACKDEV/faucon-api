"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ownerController = void 0;
const database_1 = require("../config/database");
const response_1 = require("../utils/response");
const constants_1 = require("../utils/constants");
const dayBounds_1 = require("../utils/dayBounds");
function safePosition(position) {
    return {
        id: position.id.toString(),
        latitude: position.latitude,
        longitude: position.longitude,
        altitude: position.altitude,
        vitesse: position.vitesse,
        cap: position.cap,
        satellites: position.nbSatellites,
        signal: position.niveauSignal,
        hdop: position.hdop,
        batterie: position.niveauBatterie,
        contact: position.statutACC,
        horodatage: position.horodatage,
        recuLe: position.dateReception,
    };
}
function isOnline(derniereCommunication) {
    return (!!derniereCommunication &&
        Date.now() - derniereCommunication.getTime() < constants_1.EN_LIGNE_SEUIL_MS);
}
const vehicleSelect = {
    id: true,
    nom: true,
    trackerId: true,
    modeActuel: true,
    niveauBatterie: true,
    estActif: true,
    derniereCommunication: true,
    limiteVitesse: { select: { seuilKmh: true, estActive: true } },
    perimetreGeofence: {
        select: {
            nom: true,
            centreLat: true,
            centreLon: true,
            rayonMetres: true,
            estActif: true,
        },
    },
};
async function findOwnedVehicle(id, utilisateurId) {
    return database_1.prisma.vehicule.findFirst({
        where: { id, utilisateurId },
        select: vehicleSelect,
    });
}
exports.ownerController = {
    listVehicles: async (req, res) => {
        try {
            const vehicles = await database_1.prisma.vehicule.findMany({
                where: { utilisateurId: req.user.id },
                orderBy: { dateAjout: 'desc' },
                select: vehicleSelect,
            });
            const latest = await database_1.prisma.position.findMany({
                where: { vehiculeId: { in: vehicles.map((v) => v.id) } },
                orderBy: { horodatage: 'desc' },
                distinct: ['vehiculeId'],
                select: {
                    vehiculeId: true,
                    latitude: true,
                    longitude: true,
                    vitesse: true,
                    cap: true,
                    niveauBatterie: true,
                    horodatage: true,
                },
            });
            const latestByVehicle = new Map(latest.map((p) => [p.vehiculeId, p]));
            const data = vehicles.map((vehicle) => {
                const position = latestByVehicle.get(vehicle.id);
                return {
                    ...vehicle,
                    enLigne: isOnline(vehicle.derniereCommunication),
                    dernierePosition: position
                        ? {
                            latitude: position.latitude,
                            longitude: position.longitude,
                            vitesse: position.vitesse,
                            cap: position.cap,
                            batterie: position.niveauBatterie,
                            horodatage: position.horodatage,
                        }
                        : null,
                };
            });
            return (0, response_1.sendSuccess)(res, 'Véhicules récupérés', data);
        }
        catch {
            return (0, response_1.sendError)(res, 'Impossible de récupérer les véhicules', 400);
        }
    },
    getVehicle: async (req, res) => {
        try {
            const vehicle = await findOwnedVehicle(String(req.params.id), req.user.id);
            if (!vehicle)
                return (0, response_1.sendError)(res, 'Véhicule introuvable', 404);
            const position = await database_1.prisma.position.findFirst({
                where: { vehiculeId: vehicle.id },
                orderBy: { horodatage: 'desc' },
                select: {
                    id: true,
                    latitude: true,
                    longitude: true,
                    altitude: true,
                    vitesse: true,
                    cap: true,
                    nbSatellites: true,
                    niveauSignal: true,
                    hdop: true,
                    niveauBatterie: true,
                    statutACC: true,
                    horodatage: true,
                    dateReception: true,
                },
            });
            return (0, response_1.sendSuccess)(res, 'Véhicule récupéré', {
                ...vehicle,
                enLigne: isOnline(vehicle.derniereCommunication),
                dernierePosition: position ? safePosition(position) : null,
            });
        }
        catch {
            return (0, response_1.sendError)(res, 'Impossible de récupérer le véhicule', 400);
        }
    },
    lastPosition: async (req, res) => {
        try {
            const vehicle = await findOwnedVehicle(String(req.params.id), req.user.id);
            if (!vehicle)
                return (0, response_1.sendError)(res, 'Véhicule introuvable', 404);
            const position = await database_1.prisma.position.findFirst({
                where: { vehiculeId: vehicle.id },
                orderBy: { horodatage: 'desc' },
                select: {
                    id: true,
                    latitude: true,
                    longitude: true,
                    altitude: true,
                    vitesse: true,
                    cap: true,
                    nbSatellites: true,
                    niveauSignal: true,
                    hdop: true,
                    niveauBatterie: true,
                    statutACC: true,
                    horodatage: true,
                    dateReception: true,
                },
            });
            return (0, response_1.sendSuccess)(res, position ? 'Dernière position' : 'Aucune position connue', position ? safePosition(position) : null);
        }
        catch {
            return (0, response_1.sendError)(res, 'Impossible de récupérer la position', 400);
        }
    },
    positions: async (req, res) => {
        try {
            const vehiculeId = String(req.params.id);
            const vehicle = await findOwnedVehicle(vehiculeId, req.user.id);
            if (!vehicle)
                return (0, response_1.sendError)(res, 'Véhicule introuvable', 404);
            const from = req.query.from ? String(req.query.from) : undefined;
            const to = req.query.to ? String(req.query.to) : undefined;
            const date = req.query.date ? String(req.query.date) : undefined;
            let where;
            if (from || to) {
                const gte = from ? new Date(from) : undefined;
                const lte = to ? new Date(to) : undefined;
                if ((gte && Number.isNaN(gte.getTime())) ||
                    (lte && Number.isNaN(lte.getTime()))) {
                    return (0, response_1.sendError)(res, 'Dates invalides (format ISO 8601 attendu)', 400);
                }
                where = {
                    vehiculeId,
                    ...(gte || lte
                        ? { horodatage: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } }
                        : {}),
                };
            }
            else {
                const targetDate = date ?? new Date().toISOString().slice(0, 10);
                if (Number.isNaN(new Date(targetDate).getTime())) {
                    return (0, response_1.sendError)(res, 'Date invalide (format YYYY-MM-DD attendu)', 400);
                }
                const { start, end } = (0, dayBounds_1.dayBounds)(targetDate);
                where = { vehiculeId, horodatage: { gte: start, lte: end } };
            }
            const positions = await database_1.prisma.position.findMany({
                where,
                orderBy: { horodatage: 'asc' },
                take: 10000,
                select: {
                    id: true,
                    latitude: true,
                    longitude: true,
                    altitude: true,
                    vitesse: true,
                    cap: true,
                    nbSatellites: true,
                    niveauSignal: true,
                    hdop: true,
                    niveauBatterie: true,
                    statutACC: true,
                    horodatage: true,
                    dateReception: true,
                },
            });
            return (0, response_1.sendSuccess)(res, 'Historique récupéré', positions.map((position) => safePosition(position)));
        }
        catch {
            return (0, response_1.sendError)(res, 'Impossible de récupérer l’historique', 400);
        }
    },
    alerts: async (req, res) => {
        try {
            const vehiculeId = String(req.params.id);
            const vehicle = await findOwnedVehicle(vehiculeId, req.user.id);
            if (!vehicle)
                return (0, response_1.sendError)(res, 'Véhicule introuvable', 404);
            const requestedLimit = Number(req.query.limit ?? 50);
            const limit = Number.isFinite(requestedLimit)
                ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
                : 50;
            const unreadOnly = req.query.unread === 'true';
            const alerts = await database_1.prisma.alarme.findMany({
                where: {
                    vehiculeId,
                    ...(unreadOnly ? { estAcquittee: false } : {}),
                },
                orderBy: { horodatage: 'desc' },
                take: limit,
                select: {
                    id: true,
                    typeAlarme: true,
                    latitude: true,
                    longitude: true,
                    valeurMesuree: true,
                    seuilConfigure: true,
                    estAcquittee: true,
                    dateAcquittement: true,
                    horodatage: true,
                },
            });
            return (0, response_1.sendSuccess)(res, 'Alertes récupérées', alerts);
        }
        catch {
            return (0, response_1.sendError)(res, 'Impossible de récupérer les alertes', 400);
        }
    },
    health: async (req, res) => {
        try {
            const vehiculeId = String(req.params.id);
            const vehicle = await findOwnedVehicle(vehiculeId, req.user.id);
            if (!vehicle)
                return (0, response_1.sendError)(res, 'Véhicule introuvable', 404);
            const diagnostic = await database_1.prisma.diagnosticTraceur.findFirst({
                where: { vehiculeId },
                orderBy: { horodatage: 'desc' },
                // Sélection stricte : pas de compteurs de reset, mémoire, I2C,
                // firmware ni payload brut interne.
                select: {
                    horodatage: true,
                    mode: true,
                    fixValide: true,
                    fixPerime: true,
                    ageFixSecondes: true,
                    satellites: true,
                    hdop: true,
                    batteriePct: true,
                    signalPct: true,
                    signalValide: true,
                },
            });
            return (0, response_1.sendSuccess)(res, diagnostic ? 'État du traceur' : 'Aucun diagnostic disponible', diagnostic);
        }
        catch {
            return (0, response_1.sendError)(res, 'Impossible de récupérer l’état du traceur', 400);
        }
    },
};
