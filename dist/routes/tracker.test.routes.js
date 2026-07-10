"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const position_handler_1 = require("../tracker/position.handler");
const vehicle_lookup_service_1 = require("../services/vehicle-lookup.service");
const router = express_1.default.Router();
// POST /test/trame - body: full trame JSON or minimal POSITION fields
router.post('/trame', async (req, res) => {
    try {
        const trame = req.body;
        if (!trame || !trame.type || !trame.imei)
            return res.status(400).json({ error: 'Invalid payload' });
        const vehicule = await (0, vehicle_lookup_service_1.findVehiculeByIdentifier)(trame.imei);
        if (!vehicule)
            return res.status(404).json({ error: 'Vehicule not found for imei/trackerId' });
        if (trame.type === 'POSITION') {
            await (0, position_handler_1.handlePositionPayload)(vehicule.id, {
                latitude: trame.lat,
                longitude: trame.lon,
                vitesse: trame.speed || 0,
                cap: trame.cap || 0,
                battery: trame.battery || 0,
                timestamp: new Date(trame.ts),
                source: 'http',
            });
            return res.json({ status: 'OK' });
        }
        return res.status(400).json({ error: 'Only POSITION trame supported by this test endpoint' });
    }
    catch (err) {
        console.error('[TEST ROUTE] Error', err);
        return res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
