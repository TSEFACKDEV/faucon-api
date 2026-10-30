import { Router } from 'express';
import { ownerController } from '../controllers/owner.controller';
import { requireOwnerApiKey } from '../middlewares/ownerApiKey.middleware';
import { rateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

// API propriétaire : clé API en lecture seule, aucune route d'écriture.
router.use(requireOwnerApiKey);
router.use(rateLimit(120, 60_000));

router.get('/vehicles', ownerController.listVehicles);
router.get('/vehicles/:id', ownerController.getVehicle);
router.get('/vehicles/:id/position/last', ownerController.lastPosition);
router.get('/vehicles/:id/positions', ownerController.positions);
router.get('/vehicles/:id/alerts', ownerController.alerts);
router.get('/vehicles/:id/health', ownerController.health);

export default router;
