"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vehicleController = void 0;
const vehicle_service_1 = require("../services/vehicle.service");
const response_1 = require("../utils/response");
const database_1 = require("../config/database");
const report_generator_1 = require("../cron/report.generator");
const params_1 = require("../utils/params");
const trame_validator_1 = require("../tracker/trame.validator");
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
            const id = (0, params_1.getParamId)(req.params.id);
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
            const id = (0, params_1.getParamId)(req.params.id);
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
            const id = (0, params_1.getParamId)(req.params.id);
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
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            // `!seuilKmh` rejetterait seulement les valeurs "falsy" (0, vide) mais
            // laisserait passer une valeur négative ("-5" est truthy) — un seuil
            // négatif rendrait toute vitesse mesurée "excessive" en continu.
            const seuilKmh = Number(req.body.seuilKmh);
            if (!Number.isFinite(seuilKmh) || seuilKmh <= 0 || seuilKmh > 300) {
                return (0, response_1.sendError)(res, 'Seuil de vitesse invalide (entre 0 et 300 km/h)', 400);
            }
            const result = await vehicle_service_1.vehicleService.setSpeedLimit(id, req.user.id, seuilKmh);
            return (0, response_1.sendSuccess)(res, 'Limite de vitesse configurée', result);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    setGeofence: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            // `!centreLat`/`!centreLon` rejetterait à tort une coordonnée à 0°
            // (l'équateur ou le méridien de Greenwich sont des latitudes/longitudes
            // valides, 0 est "falsy" en JS) ; `!rayonMetres` laisse passer un rayon
            // négatif ("-5" est truthy), qui ferait déclencher SORTIE_ZONE en boucle
            // dès la position suivante (distance > rayon négatif est ~toujours vrai).
            const { nom } = req.body;
            const centreLat = Number(req.body.centreLat);
            const centreLon = Number(req.body.centreLon);
            const rayonMetres = Number(req.body.rayonMetres);
            if (!nom || !(0, trame_validator_1.isValidCoord)(centreLat, centreLon)) {
                return (0, response_1.sendError)(res, 'Coordonnées du centre invalides', 400);
            }
            if (!Number.isFinite(rayonMetres) || rayonMetres <= 0) {
                return (0, response_1.sendError)(res, 'Rayon de la zone invalide', 400);
            }
            const result = await vehicle_service_1.vehicleService.setGeofence(id, req.user.id, nom, centreLat, centreLon, rayonMetres);
            return (0, response_1.sendSuccess)(res, 'Zone de sécurité configurée', result);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    setMode: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
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
    // Demande au traceur le mode qu'il applique réellement (commande MODE?).
    // La réponse arrive par ACK — le handler d'ACK resynchronise la base et
    // notifie l'app via WebSocket ; cette route ne fait qu'émettre la demande.
    readMode: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const commande = await vehicle_service_1.vehicleService.readMode(id, req.user.id);
            return (0, response_1.sendSuccess)(res, 'Lecture du mode demandée au traceur', commande, 201);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    setPhoneAlerte: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const { telephone } = req.body;
            if (!telephone || typeof telephone !== 'string') {
                return (0, response_1.sendError)(res, 'Numéro de téléphone requis', 400);
            }
            const result = await vehicle_service_1.vehicleService.setPhoneAlerte(id, req.user.id, telephone.trim());
            return (0, response_1.sendSuccess)(res, 'Numéro SMS mis à jour', result);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    sendCommande: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const { codeCommande, valeur } = req.body;
            const codesValides = ['LOCALISER', 'MODE', 'MODE?', 'REDEMARRER', 'RESET_USINE', 'NUMERO_SMS'];
            if (!codesValides.includes(codeCommande)) {
                return (0, response_1.sendError)(res, `Commande invalide (${codesValides.join(' | ')})`, 400);
            }
            if (codeCommande === 'MODE' && !['WORK', 'MOVE', 'STANDBY'].includes(valeur)) {
                return (0, response_1.sendError)(res, 'Mode invalide (WORK | MOVE | STANDBY)', 400);
            }
            if (codeCommande === 'NUMERO_SMS' && !/^\+[1-9]\d{7,14}$/.test(valeur ?? '')) {
                return (0, response_1.sendError)(res, 'Numéro invalide (format attendu : +237XXXXXXXXX)', 400);
            }
            const commande = await vehicle_service_1.vehicleService.sendCommande(id, req.user.id, codeCommande, valeur !== undefined ? { valeur } : undefined);
            return (0, response_1.sendSuccess)(res, 'Commande envoyée', commande, 201);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    getCommandes: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const commandes = await vehicle_service_1.vehicleService.getCommandes(id, req.user.id);
            return (0, response_1.sendSuccess)(res, 'Commandes récupérées', commandes);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    getLastPosition: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
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
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const from = req.query.from;
            const to = req.query.to;
            const date = req.query.date;
            const positions = from || to
                ? await vehicle_service_1.vehicleService.getPositionHistoryRange(id, req.user.id, from, to)
                : await vehicle_service_1.vehicleService.getPositionHistory(id, req.user.id, date ?? (0, report_generator_1.toIsoDateDouala)(new Date()));
            return (0, response_1.sendSuccess)(res, 'Historique récupéré', positions);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    getDailyReport: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const date = req.query.date ?? (0, report_generator_1.toIsoDateDouala)(new Date());
            if (date > (0, report_generator_1.toIsoDateDouala)(new Date())) {
                return (0, response_1.sendError)(res, 'Impossible de générer un rapport pour une date future', 400);
            }
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
            const id = (0, params_1.getParamId)(req.params.id);
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
            const alarmeId = (0, params_1.getParamId)(req.params.alarmeId ?? req.params.id);
            if (!alarmeId)
                return (0, response_1.sendError)(res, 'ID de l\'alarme requis', 400);
            const alarme = await vehicle_service_1.vehicleService.acquitAlarme(alarmeId, req.user.id);
            return (0, response_1.sendSuccess)(res, 'Alarme acquittée', alarme);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    deleteAlarme: async (req, res) => {
        try {
            const alarmeId = (0, params_1.getParamId)(req.params.alarmeId ?? req.params.id);
            if (!alarmeId)
                return (0, response_1.sendError)(res, 'ID de l\'alarme requis', 400);
            await vehicle_service_1.vehicleService.deleteAlarme(alarmeId, req.user.id);
            return (0, response_1.sendSuccess)(res, 'Alarme supprimée');
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    generateReport: async (req, res) => {
        try {
            // 1. Correction de l'ID avec la fonction utilitaire
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID du véhicule requis', 400);
            const { date } = req.body;
            const targetDate = date ? new Date(date) : new Date();
            if ((0, report_generator_1.toIsoDateDouala)(targetDate) > (0, report_generator_1.toIsoDateDouala)(new Date())) {
                return (0, response_1.sendError)(res, 'Impossible de générer un rapport pour une date future', 400);
            }
            // 2. Utilisation de l'ID validé pour la vérification
            const vehicle = await database_1.prisma.vehicule.findFirst({
                where: { id: id, utilisateurId: req.user.id },
            });
            if (!vehicle)
                return (0, response_1.sendError)(res, 'Véhicule introuvable', 404);
            // 3. Utilisation de l'ID validé pour la génération
            await (0, report_generator_1.generateVehicleReport)(id, targetDate);
            // Même dérivation que generateVehicleReport (Douala, pas UTC) — sinon
            // on relit sous un jour calendaire différent de celui qui vient d'être
            // écrit et on retombe systématiquement sur `report === null`.
            const report = await database_1.prisma.rapportJournalier.findFirst({
                where: {
                    vehiculeId: id,
                    date: new Date((0, report_generator_1.toIsoDateDouala)(targetDate)),
                },
            });
            return (0, response_1.sendSuccess)(res, 'Rapport généré', report);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
};
