"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendError = exports.sendSuccess = void 0;
const sendSuccess = (res, message, data, statusCode = 200) => {
    const body = { success: true, message, data };
    return res.status(statusCode).json(body);
};
exports.sendSuccess = sendSuccess;
const sendError = (res, message, statusCode = 400) => {
    const body = { success: false, message };
    return res.status(statusCode).json(body);
};
exports.sendError = sendError;
