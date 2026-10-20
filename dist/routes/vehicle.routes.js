"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const vehicle_controller_1 = require("../controllers/vehicle.controller");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const rateLimit_middleware_1 = require("../middlewares/rateLimit.middleware");
const router = (0, express_1.Router)();
// Toutes les routes véhicules sont protégées
router.use(auth_middleware_1.protect);
// Limitation de débit : 60 requêtes par minute par IP (suffisant pour un
// usage normal — un widget du dashboard rafraîchit toutes les ~10s, donc
// ~6 appels/minute par onglet actif).
router.use((0, rateLimit_middleware_1.rateLimit)(60, 60000));
router.post('/connect', vehicle_controller_1.vehicleController.addVehicle);
router.post('/', vehicle_controller_1.vehicleController.addVehicle);
router.get('/', vehicle_controller_1.vehicleController.getVehicles);
router.get('/:id', vehicle_controller_1.vehicleController.getVehicleById);
router.put('/:id', vehicle_controller_1.vehicleController.updateVehicle);
router.delete('/:id', vehicle_controller_1.vehicleController.deleteVehicle);
router.put('/:id/speed-limit', vehicle_controller_1.vehicleController.setSpeedLimit);
router.put('/:id/geofence', vehicle_controller_1.vehicleController.setGeofence);
router.put('/:id/mode', vehicle_controller_1.vehicleController.setMode);
// Demande au traceur son mode actuel (lecture seule, sans valeur) — distinct
// du PUT ci-dessus qui IMPOSE un mode.
router.post('/:id/mode/read', vehicle_controller_1.vehicleController.readMode);
router.put('/:id/telephone-alerte', vehicle_controller_1.vehicleController.setPhoneAlerte);
router.post('/:id/commandes', vehicle_controller_1.vehicleController.sendCommande);
router.get('/:id/commandes', vehicle_controller_1.vehicleController.getCommandes);
router.get('/:id/position/last', vehicle_controller_1.vehicleController.getLastPosition);
router.get('/:id/position/history', vehicle_controller_1.vehicleController.getPositionHistory);
router.get('/:id/report/daily', vehicle_controller_1.vehicleController.getDailyReport);
router.get('/:id/alarmes', vehicle_controller_1.vehicleController.getAlarmes);
router.patch('/:id/alarmes/:alarmeId/acquit', vehicle_controller_1.vehicleController.acquitAlarme);
router.delete('/:id/alarmes/:alarmeId', vehicle_controller_1.vehicleController.deleteAlarme);
router.post('/:id/report/generate', vehicle_controller_1.vehicleController.generateReport);
exports.default = router;
