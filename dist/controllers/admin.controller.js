"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminController = void 0;
const provisioning_service_1 = require("../services/provisioning.service");
const response_1 = require("../utils/response");
exports.adminController = {
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
};
