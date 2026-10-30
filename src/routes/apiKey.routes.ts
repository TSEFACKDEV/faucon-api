import { Router } from 'express';
import { apiKeyController } from '../controllers/apiKey.controller';
import { protect } from '../middlewares/auth.middleware';
import { rateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

// Gestion des clés : réservée au propriétaire authentifié par JWT.
router.use(protect);
router.use(rateLimit(20, 60_000));

router.get('/', apiKeyController.list);
router.post('/', apiKeyController.create);
router.delete('/:id', apiKeyController.revoke);

export default router;
