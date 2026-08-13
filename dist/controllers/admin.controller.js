"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminController = void 0;
const admin_service_1 = require("../services/admin.service");
const provisioning_service_1 = require("../services/provisioning.service");
const response_1 = require("../utils/response");
const params_1 = require("../utils/params");
const ROLE_VALUES = ['UTILISATEUR', 'ADMIN'];
const CODES_COMMANDE = ['LOCALISER', 'MODE', 'REDEMARRER', 'RESET_USINE'];
exports.adminController = {
    // ── Utilisateurs ──────────────────────────────────────────────
    getUtilisateurs: async (_req, res) => {
        try {
            const data = await admin_service_1.adminService.getUtilisateurs();
            return (0, response_1.sendSuccess)(res, 'Utilisateurs récupérés', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    getUtilisateurById: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID utilisateur requis', 400);
            const data = await admin_service_1.adminService.getUtilisateurById(id);
            return (0, response_1.sendSuccess)(res, 'Utilisateur récupéré', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 404);
        }
    },
    creerUtilisateur: async (req, res) => {
        try {
            const { userName, email, password, role } = req.body;
            if (!userName || !email || !password) {
                return (0, response_1.sendError)(res, 'Tous les champs sont requis', 400);
            }
            if (!ROLE_VALUES.includes(role)) {
                return (0, response_1.sendError)(res, 'Rôle invalide (UTILISATEUR | ADMIN)', 400);
            }
            if (typeof password !== 'string' || password.length < 8) {
                return (0, response_1.sendError)(res, 'Le mot de passe doit contenir au moins 8 caractères', 400);
            }
            const data = await admin_service_1.adminService.creerUtilisateur(String(userName), String(email), password, role);
            return (0, response_1.sendSuccess)(res, 'Utilisateur créé', data, 201);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    setRole: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            const { role } = req.body;
            if (!id)
                return (0, response_1.sendError)(res, 'ID utilisateur requis', 400);
            if (!ROLE_VALUES.includes(role)) {
                return (0, response_1.sendError)(res, 'Rôle invalide (UTILISATEUR | ADMIN)', 400);
            }
            const data = await admin_service_1.adminService.setRole(id, role);
            return (0, response_1.sendSuccess)(res, 'Rôle mis à jour', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    supprimerUtilisateur: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID utilisateur requis', 400);
            await admin_service_1.adminService.supprimerUtilisateur(id);
            return (0, response_1.sendSuccess)(res, 'Utilisateur supprimé');
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    // ── Traceurs (vue globale) ─────────────────────────────────────
    getVehicules: async (_req, res) => {
        try {
            const data = await admin_service_1.adminService.getVehicules();
            return (0, response_1.sendSuccess)(res, 'Traceurs récupérés', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    getVehiculeById: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID traceur requis', 400);
            const data = await admin_service_1.adminService.getVehiculeById(id);
            return (0, response_1.sendSuccess)(res, 'Traceur récupéré', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 404);
        }
    },
    updateVehicule: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID traceur requis', 400);
            const { nom, estActif, utilisateurId } = req.body;
            const data = await admin_service_1.adminService.updateVehicule(id, {
                ...(nom !== undefined ? { nom: String(nom) } : {}),
                ...(estActif !== undefined ? { estActif: Boolean(estActif) } : {}),
                ...(utilisateurId !== undefined ? { utilisateurId: utilisateurId === '' ? null : String(utilisateurId) } : {}),
            });
            return (0, response_1.sendSuccess)(res, 'Traceur mis à jour', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    supprimerVehicule: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID traceur requis', 400);
            await admin_service_1.adminService.supprimerVehicule(id);
            return (0, response_1.sendSuccess)(res, 'Traceur supprimé');
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    sendCommande: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID traceur requis', 400);
            const { codeCommande, valeur } = req.body;
            if (!CODES_COMMANDE.includes(codeCommande)) {
                return (0, response_1.sendError)(res, `Commande invalide (${CODES_COMMANDE.join(' | ')})`, 400);
            }
            if (codeCommande === 'MODE' && !['WORK', 'MOVE', 'STANDBY'].includes(valeur)) {
                return (0, response_1.sendError)(res, 'Mode invalide (WORK | MOVE | STANDBY)', 400);
            }
            const data = await admin_service_1.adminService.sendCommande(id, codeCommande, valeur !== undefined ? String(valeur) : undefined);
            return (0, response_1.sendSuccess)(res, 'Commande envoyée', data, 201);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    provisionVehicules: async (req, res) => {
        try {
            const count = Number(req.body.count ?? 0);
            const prefix = String(req.body.prefix ?? 'FCN');
            const lot = await (0, provisioning_service_1.provisionerLot)(count, prefix);
            return (0, response_1.sendSuccess)(res, `${lot.length} traceur(s) provisionné(s)`, lot, 201);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    setMode: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            const { mode } = req.body;
            if (!id)
                return (0, response_1.sendError)(res, 'ID traceur requis', 400);
            if (!['WORK', 'MOVE', 'STANDBY'].includes(mode)) {
                return (0, response_1.sendError)(res, 'Mode invalide (WORK | MOVE | STANDBY)', 400);
            }
            const data = await admin_service_1.adminService.setMode(id, mode);
            return (0, response_1.sendSuccess)(res, 'Mode mis à jour', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    setSpeedLimit: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            const { seuilKmh } = req.body;
            if (!id)
                return (0, response_1.sendError)(res, 'ID traceur requis', 400);
            if (!seuilKmh)
                return (0, response_1.sendError)(res, 'Seuil requis', 400);
            const data = await admin_service_1.adminService.setSpeedLimit(id, Number(seuilKmh));
            return (0, response_1.sendSuccess)(res, 'Limite de vitesse configurée', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    setGeofence: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            const { nom, centreLat, centreLon, rayonMetres } = req.body;
            if (!id)
                return (0, response_1.sendError)(res, 'ID traceur requis', 400);
            if (!nom || !centreLat || !centreLon || !rayonMetres) {
                return (0, response_1.sendError)(res, 'Tous les champs géofence sont requis', 400);
            }
            const data = await admin_service_1.adminService.setGeofence(id, String(nom), Number(centreLat), Number(centreLon), Number(rayonMetres));
            return (0, response_1.sendSuccess)(res, 'Zone de sécurité configurée', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    setPhoneAlerte: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.id);
            const { telephone } = req.body;
            if (!id)
                return (0, response_1.sendError)(res, 'ID traceur requis', 400);
            if (!telephone || typeof telephone !== 'string') {
                return (0, response_1.sendError)(res, 'Numéro de téléphone requis', 400);
            }
            const data = await admin_service_1.adminService.setPhoneAlerte(id, telephone.trim());
            return (0, response_1.sendSuccess)(res, 'Numéro SMS mis à jour', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    // ── Alarmes ────────────────────────────────────────────────────
    getAlarmes: async (req, res) => {
        try {
            const { typeAlarme, estAcquittee, vehiculeId } = req.query;
            const data = await admin_service_1.adminService.getAlarmes({
                ...(typeof typeAlarme === 'string' ? { typeAlarme } : {}),
                ...(estAcquittee !== undefined ? { estAcquittee: estAcquittee === 'true' } : {}),
                ...(typeof vehiculeId === 'string' ? { vehiculeId } : {}),
            });
            return (0, response_1.sendSuccess)(res, 'Alarmes récupérées', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    acquitAlarme: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.alarmeId ?? req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID alarme requis', 400);
            const data = await admin_service_1.adminService.acquitAlarme(id);
            return (0, response_1.sendSuccess)(res, 'Alarme acquittée', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    deleteAlarme: async (req, res) => {
        try {
            const id = (0, params_1.getParamId)(req.params.alarmeId ?? req.params.id);
            if (!id)
                return (0, response_1.sendError)(res, 'ID alarme requis', 400);
            await admin_service_1.adminService.deleteAlarme(id);
            return (0, response_1.sendSuccess)(res, 'Alarme supprimée');
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
    // ── Statistiques ───────────────────────────────────────────────
    getStatsOverview: async (_req, res) => {
        try {
            const data = await admin_service_1.adminService.getStatsOverview();
            return (0, response_1.sendSuccess)(res, 'Statistiques récupérées', data);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, err.statusCode ?? 400);
        }
    },
};
