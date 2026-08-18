import { Router } from 'express';
import { vehicleController } from '../controllers/vehicle.controller';
import { protect } from '../middlewares/auth.middleware';
import { rateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

// Toutes les routes véhicules sont protégées
router.use(protect);

// Limitation de débit : 60 requêtes par minute par IP (suffisant pour un
// usage normal — un widget du dashboard rafraîchit toutes les ~10s, donc
// ~6 appels/minute par onglet actif).
router.use(rateLimit(60, 60_000));

router.post('/connect',                      vehicleController.addVehicle);
router.post('/',                              vehicleController.addVehicle);
router.get('/',                               vehicleController.getVehicles);
router.get('/:id',                            vehicleController.getVehicleById);
router.put('/:id',                            vehicleController.updateVehicle);
router.delete('/:id',                         vehicleController.deleteVehicle);

router.put('/:id/speed-limit',                vehicleController.setSpeedLimit);
router.put('/:id/geofence',                   vehicleController.setGeofence);
router.put('/:id/mode',                       vehicleController.setMode);
router.put('/:id/telephone-alerte',           vehicleController.setPhoneAlerte);

router.post('/:id/commandes',                 vehicleController.sendCommande);
router.get('/:id/commandes',                  vehicleController.getCommandes);

router.get('/:id/position/last',              vehicleController.getLastPosition);
router.get('/:id/position/history',           vehicleController.getPositionHistory);
router.get('/:id/report/daily',               vehicleController.getDailyReport);
router.get('/:id/alarmes',                    vehicleController.getAlarmes);
router.patch('/:id/alarmes/:alarmeId/acquit', vehicleController.acquitAlarme);
router.delete('/:id/alarmes/:alarmeId',       vehicleController.deleteAlarme);

router.post('/:id/report/generate', vehicleController.generateReport);

export default router;