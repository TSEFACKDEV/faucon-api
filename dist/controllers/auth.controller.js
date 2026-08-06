"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authController = void 0;
const auth_service_1 = require("../services/auth.service");
const response_1 = require("../utils/response");
exports.authController = {
    register: async (req, res) => {
        try {
            const { userName, email, password } = req.body;
            if (!userName || !email || !password) {
                return (0, response_1.sendError)(res, 'Tous les champs sont requis', 400);
            }
            const result = await auth_service_1.authService.register(userName, email, password);
            return (0, response_1.sendSuccess)(res, 'Inscription réussie', result, 201);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, 400);
        }
    },
    login: async (req, res) => {
        try {
            const { email, password } = req.body;
            if (!email || !password) {
                return (0, response_1.sendError)(res, 'Email et mot de passe requis', 400);
            }
            const result = await auth_service_1.authService.login(email, password);
            return (0, response_1.sendSuccess)(res, 'Connexion réussie', result);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, 401);
        }
    },
    me: async (req, res) => {
        try {
            const user = await auth_service_1.authService.me(req.user.id);
            return (0, response_1.sendSuccess)(res, 'Profil récupéré', user);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, 404);
        }
    },
    updateMe: async (req, res) => {
        try {
            const { userName, email, telephone } = req.body;
            const user = await auth_service_1.authService.updateProfile(req.user.id, { userName, email, telephone });
            return (0, response_1.sendSuccess)(res, 'Profil mis à jour', user);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, 400);
        }
    },
    logout: async (req, res) => {
        try {
            const { refreshToken } = req.body;
            if (refreshToken)
                await auth_service_1.authService.logout(refreshToken);
            return (0, response_1.sendSuccess)(res, 'Déconnexion réussie');
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, 400);
        }
    },
    refresh: async (req, res) => {
        try {
            const { refreshToken } = req.body;
            if (!refreshToken)
                return (0, response_1.sendError)(res, 'Token requis', 400);
            const result = await auth_service_1.authService.refresh(refreshToken);
            return (0, response_1.sendSuccess)(res, 'Token renouvelé', result);
        }
        catch (err) {
            return (0, response_1.sendError)(res, err.message, 401);
        }
    },
};
