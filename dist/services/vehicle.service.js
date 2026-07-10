"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vehicleService = void 0;
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const vehicle_lookup_service_1 = require("./vehicle-lookup.service");
exports.vehicleService = {
    addVehicle: async (utilisateurId, identifier, nom, pin) => {
        const existing = await (0, vehicle_lookup_service_1.findVehiculeByIdentifier)(identifier);
        if (!existing) {
            throw new errors_1.NotFoundError('Traceur non enregistré. Veuillez vérifier l’identifiant du boîtier.');
        }
        if (existing.utilisateurId && existing.utilisateurId !== utilisateurId) {
            throw new errors_1.AppError('Ce traceur est déjà connecté à un autre compte.', 409);
        }
        // Le PIN n'est exigé qu'au moment du premier rattachement (le traceur
        // n'a pas encore de propriétaire) — un traceur provisionné en série a
        // toujours un pinActivation ; les anciens traceurs de démo/seed n'en ont
        // pas et restent réclamables sans PIN.
        if (!existing.utilisateurId && existing.pinActivation) {
            if (!pin || pin.toUpperCase() !== existing.pinActivation) {
                throw new errors_1.AppError('Code d’activation invalide. Vérifiez le PIN imprimé sur le boîtier.', 400);
            }
        }
        const updateData = {
            nom: nom ?? existing.nom,
            estActif: true,
        };
        if (!existing.utilisateurId) {
            updateData.utilisateurId = utilisateurId;
        }
        if (!existing.imei && /^[0-9]{15}$/.test(identifier)) {
            updateData.imei = identifier;
        }
        if (!existing.trackerId) {
            updateData.trackerId = identifier;
        }
        return database_1.prisma.vehicule.update({
            where: { id: existing.id },
            data: updateData,
            select: {
                id: true, imei: true, trackerId: true, nom: true,
                modeActuel: true, niveauBatterie: true, estActif: true, dateAjout: true,
            },
        });
    },
    getVehicles: async (utilisateurId) => {
        return database_1.prisma.vehicule.findMany({
            where: { utilisateurId },
            select: {
                id: true, imei: true, nom: true, image: true,
                modeActuel: true, niveauBatterie: true, estActif: true,
                derniereCommunication: true,
                limiteVitesse: true,
                perimetreGeofence: true,
            },
            orderBy: { dateAjout: 'desc' },
        });
    },
    getVehicleById: async (id, utilisateurId) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({
            where: { id, utilisateurId },
            include: {
                limiteVitesse: true,
                perimetreGeofence: true,
                alarmes: {
                    where: { estAcquittee: false },
                    orderBy: { horodatage: 'desc' },
                    take: 5,
                },
            },
        });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return vehicle;
    },
    updateVehicle: async (id, utilisateurId, data) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.vehicule.update({
            where: { id },
            data,
            select: { id: true, nom: true, image: true },
        });
    },
    deleteVehicle: async (id, utilisateurId) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        await database_1.prisma.vehicule.delete({ where: { id } });
    },
    setSpeedLimit: async (vehiculeId, utilisateurId, seuilKmh) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.limiteVitesse.upsert({
            where: { vehiculeId },
            create: { vehiculeId, seuilKmh, estActive: true },
            update: { seuilKmh, estActive: true },
        });
    },
    setGeofence: async (vehiculeId, utilisateurId, nom, centreLat, centreLon, rayonMetres) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.perimetreGeofence.upsert({
            where: { vehiculeId },
            create: { vehiculeId, nom, centreLat, centreLon, rayonMetres },
            update: { nom, centreLat, centreLon, rayonMetres, estActif: true },
        });
    },
    setMode: async (vehiculeId, utilisateurId, mode) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.vehicule.update({
            where: { id: vehiculeId },
            data: { modeActuel: mode },
            select: { id: true, modeActuel: true },
        });
    },
    getLastPosition: async (vehiculeId, utilisateurId) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.position.findFirst({
            where: { vehiculeId },
            orderBy: { horodatage: 'desc' },
        });
    },
    getPositionHistory: async (vehiculeId, utilisateurId, date) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        return database_1.prisma.position.findMany({
            where: {
                vehiculeId,
                horodatage: { gte: start, lte: end },
            },
            orderBy: { horodatage: 'asc' },
            select: {
                id: true, latitude: true, longitude: true,
                vitesse: true, cap: true, horodatage: true,
            },
        });
    },
    getPositionHistoryRange: async (vehiculeId, utilisateurId, from, to) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.position.findMany({
            where: {
                vehiculeId,
                ...(from || to ? {
                    horodatage: {
                        ...(from ? { gte: new Date(from) } : {}),
                        ...(to ? { lte: new Date(to) } : {}),
                    },
                } : {}),
            },
            orderBy: { horodatage: 'asc' },
            select: {
                id: true, latitude: true, longitude: true,
                vitesse: true, cap: true, horodatage: true,
            },
        });
    },
    getDailyReport: async (vehiculeId, utilisateurId, date) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.rapportJournalier.findFirst({
            where: { vehiculeId, date: new Date(date) },
        });
    },
    getAlarmes: async (vehiculeId, utilisateurId) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.alarme.findMany({
            where: { vehiculeId },
            orderBy: { horodatage: 'desc' },
            take: 50,
        });
    },
    acquitAlarme: async (alarmeId, utilisateurId) => {
        const alarme = await database_1.prisma.alarme.findFirst({
            where: { id: alarmeId, vehicule: { utilisateurId } },
        });
        if (!alarme)
            throw new errors_1.NotFoundError('Alarme introuvable');
        return database_1.prisma.alarme.update({
            where: { id: alarmeId },
            data: { estAcquittee: true, dateAcquittement: new Date() },
        });
    },
};
