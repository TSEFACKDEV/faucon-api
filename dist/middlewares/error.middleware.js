"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFound = exports.errorHandler = void 0;
const response_1 = require("../utils/response");
const errorHandler = (err, req, res, next) => {
    console.error(`[ERROR] ${err.message}`);
    (0, response_1.sendError)(res, err.message ?? 'Erreur interne du serveur', 500);
};
exports.errorHandler = errorHandler;
const notFound = (req, res) => {
    (0, response_1.sendError)(res, `Route ${req.originalUrl} introuvable`, 404);
};
exports.notFound = notFound;
