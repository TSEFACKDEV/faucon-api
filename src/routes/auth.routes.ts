import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

router.post('/register', authController.register);
router.post('/login',    authController.login);
router.post('/logout',   authController.logout);
router.post('/refresh',  authController.refresh);
router.get('/me',        protect, authController.me);

export default router;