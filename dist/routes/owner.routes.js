"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const owner_controller_1 = require("../controllers/owner.controller");
const ownerApiKey_middleware_1 = require("../middlewares/ownerApiKey.middleware");
const rateLimit_middleware_1 = require("../middlewares/rateLimit.middleware");
const router = (0, express_1.Router)();
// API propriétaire : clé API en lecture seule, aucune route d'écriture.
router.use(ownerApiKey_middleware_1.requireOwnerApiKey);
router.use((0, rateLimit_middleware_1.rateLimit)(120, 60000));
router.get('/vehicles', owner_controller_1.ownerController.listVehicles);
router.get('/vehicles/:id', owner_controller_1.ownerController.getVehicle);
router.get('/vehicles/:id/position/last', owner_controller_1.ownerController.lastPosition);
router.get('/vehicles/:id/positions', owner_controller_1.ownerController.positions);
router.get('/vehicles/:id/alerts', owner_controller_1.ownerController.alerts);
router.get('/vehicles/:id/health', owner_controller_1.ownerController.health);
exports.default = router;
