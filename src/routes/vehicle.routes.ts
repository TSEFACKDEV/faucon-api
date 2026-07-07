import { Router } from 'express';
import { vehicleController } from '../controllers/vehicle.controller';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

// Toutes les routes véhicules sont protégées
router.use(protect);

router.post('/connect',                      vehicleController.addVehicle);
router.post('/',                              vehicleController.addVehicle);
router.get('/',                               vehicleController.getVehicles);
router.get('/:id',                            vehicleController.getVehicleById);
router.put('/:id',                            vehicleController.updateVehicle);
router.delete('/:id',                         vehicleController.deleteVehicle);

router.put('/:id/speed-limit',                vehicleController.setSpeedLimit);
router.put('/:id/geofence',                   vehicleController.setGeofence);
router.put('/:id/mode',                       vehicleController.setMode);

router.get('/:id/position/last',              vehicleController.getLastPosition);
router.get('/:id/replay',                     vehicleController.getReplay);
router.get('/:id/position/history',           vehicleController.getPositionHistory);
router.get('/:id/report/daily',               vehicleController.getDailyReport);
router.get('/:id/alarmes',                    vehicleController.getAlarmes);
router.patch('/:id/alarmes/:alarmeId/acquit', vehicleController.acquitAlarme);

router.post('/:id/report/generate', vehicleController.generateReport);

export default router;