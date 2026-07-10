"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vehicleController = void 0;
const vehicle_service_1 = require("../services/vehicle.service");
const response_1 = require("../utils/response");
const database_1 = require("../config/database");
const report_generator_1 = require("../cron/report.generator");
// Fonction utilitaire pour extraire un paramètre string
const getParamId = (param) => {
    if (!param)
        return null;
    if (Array.isArray(param))
        return param[0] || null;
    return param;
};
exports.vehicleController = {
    addVehicle: async (req, res) => {
        try {
            const rawIdentifier = req.body.imei ?? req.body.deviceId ?? req.body.id ?? req.body.trackerId;
            const rawNom = req.body.nom ?? req.body.deviceName;
            const nom = rawNom ?? `Dispositif ${String(rawIdentifier ?? '').slice(-4)}`;
            const pin = req.body.pin ?? req.body.pinActivation;
            if (!rawIdentifier)
                return (0, response_1.sendError)(res, 'Identifiant du traceur requis', 400);
            const vehicle = await vehicle_service_1.vehicleService.addVehicle(req.user.id, String(rawIdentifier), String(nom), pin ? String(pin) : undefined);
            return (0, response_1.sendSuccess)(res, 'Appareil ajouté', vehicle, 201);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    getVehicles: async (req, res) => {
        try {
            const vehicles = await vehicle_service_1.vehicleService.getVehicles(req.user.id);
            return (0, response_1.sendSuccess)(res, 'Appareils récupérés', vehicles);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    getVehicleById: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const vehicle = await vehicle_service_1.vehicleService.getVehicleById(id, req.user.id);
            return (0, response_1.sendSuccess)(res, 'Véhicule récupéré', vehicle);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 404);
        }
    },
    updateVehicle: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const { nom, image } = req.body;
            const vehicle = await vehicle_service_1.vehicleService.updateVehicle(id, req.user.id, { nom, image });
            return (0, response_1.sendSuccess)(res, 'Véhicule mis à jour', vehicle);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    deleteVehicle: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            await vehicle_service_1.vehicleService.deleteVehicle(id, req.user.id);
            return (0, response_1.sendSuccess)(res, 'Véhicule supprimé');
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    setSpeedLimit: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const { seuilKmh } = req.body;
            if (!seuilKmh)
                return (0, response_1.sendError)(res, 'Seuil requis', 400);
            const result = await vehicle_service_1.vehicleService.setSpeedLimit(id, req.user.id, Number(seuilKmh));
            return (0, response_1.sendSuccess)(res, 'Limite de vitesse configurée', result);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    setGeofence: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const { nom, centreLat, centreLon, rayonMetres } = req.body;
            if (!nom || !centreLat || !centreLon || !rayonMetres) {
                return (0, response_1.sendError)(res, 'Tous les champs géofence sont requis', 400);
            }
            const result = await vehicle_service_1.vehicleService.setGeofence(id, req.user.id, nom, Number(centreLat), Number(centreLon), Number(rayonMetres));
            return (0, response_1.sendSuccess)(res, 'Zone de sécurité configurée', result);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    setMode: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const { mode } = req.body;
            if (!['WORK', 'MOVE', 'STANDBY'].includes(mode)) {
                return (0, response_1.sendError)(res, 'Mode invalide (WORK | MOVE | STANDBY)', 400);
            }
            const result = await vehicle_service_1.vehicleService.setMode(id, req.user.id, mode);
            return (0, response_1.sendSuccess)(res, 'Mode mis à jour', result);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    getLastPosition: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const position = await vehicle_service_1.vehicleService.getLastPosition(id, req.user.id);
            return (0, response_1.sendSuccess)(res, 'Dernière position', position);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    getPositionHistory: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const from = req.query.from;
            const to = req.query.to;
            const date = req.query.date;
            const positions = from || to
                ? await vehicle_service_1.vehicleService.getPositionHistoryRange(id, req.user.id, from, to)
                : await vehicle_service_1.vehicleService.getPositionHistory(id, req.user.id, date ?? new Date().toISOString().split('T')[0]);
            return (0, response_1.sendSuccess)(res, 'Historique récupéré', positions);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    getReplay: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const from = req.query.from;
            const to = req.query.to;
            const positions = await vehicle_service_1.vehicleService.getPositionHistoryRange(id, req.user.id, from, to);
            return (0, response_1.sendSuccess)(res, 'Replay récupéré', positions);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    getDailyReport: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const date = req.query.date ?? new Date().toISOString().split('T')[0];
            const report = await vehicle_service_1.vehicleService.getDailyReport(id, req.user.id, date);
            if (!report) {
                await (0, report_generator_1.generateVehicleReport)(id, new Date(date));
                const regenerated = await vehicle_service_1.vehicleService.getDailyReport(id, req.user.id, date);
                return (0, response_1.sendSuccess)(res, 'Rapport journalier', regenerated);
            }
            return (0, response_1.sendSuccess)(res, 'Rapport journalier', report);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    getAlarmes: async (req, res) => {
        try {
            const id = getParamId(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const alarmes = await vehicle_service_1.vehicleService.getAlarmes(id, req.user.id);
            return (0, response_1.sendSuccess)(res, 'Alarmes récupérées', alarmes);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    acquitAlarme: async (req, res) => {
        try {
            const alarmeId = getParamId(req.params.alarmeId ?? req.params.id);
            if (!alarmeId)
                return (0, response_1.sendError)(res, 'ID de l\'alarme requis', 400);
            const alarme = await vehicle_service_1.vehicleService.acquitAlarme(alarmeId, req.user.id);
            return (0, response_1.sendSuccess)(res, 'Alarme acquittée', alarme);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    generateReport: async (req, res) => {
        try {
            // 1. Correction de l'ID avec la fonction utilitaire
            const id = getParamId(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const { date } = req.body;
            const targetDate = date ? new Date(date) : new Date();
            // 2. Utilisation de l'ID validé pour la vérification
            const vehicle = await database_1.prisma.vehicule.findFirst({
                where: { id: id, utilisateurId: req.user.id },
            });
            if (!vehicle)
                return (0, response_1.sendError)(res, 'Véhicule introuvable', 404);
            // 3. Utilisation de l'ID validé pour la génération
            await (0, report_generator_1.generateVehicleReport)(id, targetDate);
            const report = await database_1.prisma.rapportJournalier.findFirst({
                where: {
                    vehiculeId: id,
                    date: new Date(targetDate.toISOString().split('T')[0]),
                },
            });
            return (0, response_1.sendSuccess)(res, 'Rapport généré', report);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
};
