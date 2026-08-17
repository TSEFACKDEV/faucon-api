import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { protect } from '../middlewares/auth.middleware';
import { rateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

// 10 tentatives / 15 min / IP — limite le brute-force sur les identifiants.
const authRateLimit = rateLimit(10, 15 * 60 * 1000);
// Plus permissif : un client légitime rafraîchit son token automatiquement
// et régulièrement (plusieurs onglets, reconnexions réseau...), mais
// l'endpoint restait jusqu'ici totalement non protégé contre l'abus/DoS.
const refreshRateLimit = rateLimit(30, 15 * 60 * 1000);

router.post('/register', authRateLimit, authController.register);
router.post('/login',    authRateLimit, authController.login);
router.post('/logout',   authController.logout);
router.post('/refresh',  refreshRateLimit, authController.refresh);
router.get('/me',        protect, authController.me);
router.patch('/me',      protect, authController.updateMe);

export default router;