import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { requireProvisioningKey } from '../middlewares/apiKey.middleware';
import { rateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

router.use(requireProvisioningKey);
router.use(rateLimit(30, 15 * 60 * 1000));

router.post('/vehicules/provision', adminController.provisionVehicules);

export default router;
