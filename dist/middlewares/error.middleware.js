"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = exports.errorHandler = void 0;
const response_1 = require("../utils/response");
const errors_1 = require("../utils/errors");
// N'atteint ce handler global que ce qui n'a pas été intercepté par un
// try/catch de contrôleur (ceux-ci gèrent déjà `err.statusCode` au cas par
// cas). Une `AppError` reste un message métier volontairement destiné à
// l'utilisateur (ex. "Véhicule introuvable") — on le renvoie tel quel. Toute
// autre exception est, par définition, non anticipée (bug, erreur Prisma
// brute, etc.) : son message peut contenir des détails internes (requêtes
// SQL, chemins de fichiers...) qui n'ont rien à faire côté client. On la
// journalise en entier côté serveur mais on ne renvoie qu'un message
// générique.
const errorHandler = (err, req, res, next) => {
    console.error(`[ERROR] ${req.method} ${req.originalUrl} —`, err);
    if (err instanceof errors_1.AppError) {
        (0, response_1.sendError)(res, err.message, err.statusCode);
        return;
    }
    (0, response_1.sendError)(res, 'Erreur interne du serveur', 500);
};
exports.errorHandler = errorHandler;
const notFound = (req, res) => {
    (0, response_1.sendError)(res, 'Route introuvable', 404);
};
exports.notFound = notFound;
