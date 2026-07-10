"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotFoundError = exports.AppError = void 0;
class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}
exports.AppError = AppError;
class NotFoundError extends AppError {
    constructor(message = 'Ressource introuvable') {
        super(message, 404);
    }
}
exports.NotFoundError = NotFoundError;
