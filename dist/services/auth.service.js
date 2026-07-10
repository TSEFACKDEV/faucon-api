"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const jwt_1 = require("../utils/jwt");
exports.authService = {
    register: async (userName, email, password) => {
        const existingEmail = await database_1.prisma.utilisateur.findUnique({ where: { email } });
        if (existingEmail)
            throw new Error('Cet email est déjà utilisé');
        const existingUser = await database_1.prisma.utilisateur.findUnique({ where: { userName } });
        if (existingUser)
            throw new Error('Ce nom d\'utilisateur est déjà pris');
        const motDePasseHash = await bcryptjs_1.default.hash(password, 12);
        const user = await database_1.prisma.utilisateur.create({
            data: { userName, email, motDePasseHash },
            select: { id: true, userName: true, email: true, dateCreation: true },
        });
        const payload = { id: user.id, email: user.email, userName: user.userName };
        const accessToken = (0, jwt_1.signAccessToken)(payload);
        const refreshToken = (0, jwt_1.signRefreshToken)(payload);
        // Expiration refresh token dans 7 jours
        const dateExpiration = new Date();
        dateExpiration.setDate(dateExpiration.getDate() + 7);
        await database_1.prisma.refreshToken.create({
            data: { token: refreshToken, utilisateurId: user.id, dateExpiration },
        });
        return { user, tokens: { accessToken, refreshToken } };
    },
    login: async (email, password) => {
        const user = await database_1.prisma.utilisateur.findUnique({ where: { email } });
        if (!user)
            throw new Error('Email ou mot de passe incorrect');
        const isValid = await bcryptjs_1.default.compare(password, user.motDePasseHash);
        if (!isValid)
            throw new Error('Email ou mot de passe incorrect');
        await database_1.prisma.utilisateur.update({
            where: { id: user.id },
            data: { derniereConnexion: new Date() },
        });
        const payload = { id: user.id, email: user.email, userName: user.userName };
        const accessToken = (0, jwt_1.signAccessToken)(payload);
        const refreshToken = (0, jwt_1.signRefreshToken)(payload);
        const dateExpiration = new Date();
        dateExpiration.setDate(dateExpiration.getDate() + 7);
        await database_1.prisma.refreshToken.create({
            data: { token: refreshToken, utilisateurId: user.id, dateExpiration },
        });
        const { motDePasseHash: _, ...safeUser } = user;
        return { user: safeUser, tokens: { accessToken, refreshToken } };
    },
    me: async (userId) => {
        const user = await database_1.prisma.utilisateur.findUnique({
            where: { id: userId },
            select: { id: true, userName: true, email: true, telephone: true, dateCreation: true },
        });
        if (!user)
            throw new Error('Utilisateur introuvable');
        return user;
    },
    updateProfile: async (userId, changes) => {
        const { userName, email, telephone } = changes;
        if (userName) {
            const existing = await database_1.prisma.utilisateur.findUnique({ where: { userName } });
            if (existing && existing.id !== userId)
                throw new Error('Ce nom d\'utilisateur est déjà pris');
        }
        if (email) {
            const existing = await database_1.prisma.utilisateur.findUnique({ where: { email } });
            if (existing && existing.id !== userId)
                throw new Error('Cet email est déjà utilisé');
        }
        const user = await database_1.prisma.utilisateur.update({
            where: { id: userId },
            data: {
                ...(userName !== undefined && { userName }),
                ...(email !== undefined && { email }),
                ...(telephone !== undefined && { telephone }),
            },
            select: { id: true, userName: true, email: true, telephone: true, dateCreation: true },
        });
        return user;
    },
    logout: async (refreshToken) => {
        await database_1.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    },
    refresh: async (refreshToken) => {
        const stored = await database_1.prisma.refreshToken.findUnique({ where: { token: refreshToken } });
        if (!stored)
            throw new Error('Token de rafraîchissement invalide');
        if (new Date() > stored.dateExpiration) {
            await database_1.prisma.refreshToken.delete({ where: { token: refreshToken } });
            throw new Error('Token de rafraîchissement expiré');
        }
        const decoded = (0, jwt_1.verifyRefreshToken)(refreshToken);
        const newAccessToken = (0, jwt_1.signAccessToken)({
            id: decoded.id,
            email: decoded.email,
            userName: decoded.userName,
        });
        return { accessToken: newAccessToken };
    },
};
