"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const admin_controller_1 = require("../controllers/admin.controller");
const apiKey_middleware_1 = require("../middlewares/apiKey.middleware");
const auth_middleware_1 = require("../middlewares/auth.middleware");
const admin_middleware_1 = require("../middlewares/admin.middleware");
const rateLimit_middleware_1 = require("../middlewares/rateLimit.middleware");
const router = (0, express_1.Router)();
// Provisioning en série : outil interne d'exploitation, protégé par une clé
// API statique plutôt qu'un compte utilisateur (cf. apiKey.middleware.ts).
router.post('/vehicules/provision', apiKey_middleware_1.requireProvisioningKey, (0, rateLimit_middleware_1.rateLimit)(30, 15 * 60 * 1000), admin_controller_1.adminController.provisionVehicules);
// Toutes les autres routes d'administration exigent un compte ADMIN
// authentifié par JWT.
router.use(auth_middleware_1.protect, admin_middleware_1.requireAdmin, (0, rateLimit_middleware_1.rateLimit)(120, 60 * 1000));
router.get('/utilisateurs', admin_controller_1.adminController.getUtilisateurs);
router.get('/utilisateurs/:id', admin_controller_1.adminController.getUtilisateurById);
router.post('/utilisateurs', admin_controller_1.adminController.creerUtilisateur);
router.patch('/utilisateurs/:id/role', admin_controller_1.adminController.setRole);
router.delete('/utilisateurs/:id', admin_controller_1.adminController.supprimerUtilisateur);
router.get('/vehicules', admin_controller_1.adminController.getVehicules);
router.get('/vehicules/:id', admin_controller_1.adminController.getVehiculeById);
router.patch('/vehicules/:id', admin_controller_1.adminController.updateVehicule);
router.delete('/vehicules/:id', admin_controller_1.adminController.supprimerVehicule);
router.post('/vehicules/:id/commandes', admin_controller_1.adminController.sendCommande);
router.put('/vehicules/:id/mode', admin_controller_1.adminController.setMode);
router.put('/vehicules/:id/speed-limit', admin_controller_1.adminController.setSpeedLimit);
router.put('/vehicules/:id/geofence', admin_controller_1.adminController.setGeofence);
router.put('/vehicules/:id/telephone-alerte', admin_controller_1.adminController.setPhoneAlerte);
router.get('/alarmes', admin_controller_1.adminController.getAlarmes);
router.patch('/alarmes/:alarmeId/acquit', admin_controller_1.adminController.acquitAlarme);
router.delete('/alarmes/:alarmeId', admin_controller_1.adminController.deleteAlarme);
router.get('/stats/overview', admin_controller_1.adminController.getStatsOverview);
exports.default = router;
