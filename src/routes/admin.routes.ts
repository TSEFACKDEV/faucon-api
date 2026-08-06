import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { requireProvisioningKey } from '../middlewares/apiKey.middleware';
import { protect } from '../middlewares/auth.middleware';
import { requireAdmin } from '../middlewares/admin.middleware';
import { rateLimit } from '../middlewares/rateLimit.middleware';

const router = Router();

// Provisioning en série : outil interne d'exploitation, protégé par une clé
// API statique plutôt qu'un compte utilisateur (cf. apiKey.middleware.ts).
router.post(
  '/vehicules/provision',
  requireProvisioningKey,
  rateLimit(30, 15 * 60 * 1000),
  adminController.provisionVehicules
);

// Toutes les autres routes d'administration exigent un compte ADMIN
// authentifié par JWT.
router.use(protect, requireAdmin, rateLimit(120, 60 * 1000));

router.get('/utilisateurs', adminController.getUtilisateurs);
router.get('/utilisateurs/:id', adminController.getUtilisateurById);
router.post('/utilisateurs', adminController.creerUtilisateur);
router.patch('/utilisateurs/:id/role', adminController.setRole);
router.delete('/utilisateurs/:id', adminController.supprimerUtilisateur);

router.get('/vehicules', adminController.getVehicules);
router.get('/vehicules/:id', adminController.getVehiculeById);
router.patch('/vehicules/:id', adminController.updateVehicule);
router.delete('/vehicules/:id', adminController.supprimerVehicule);
router.post('/vehicules/:id/commandes', adminController.sendCommande);
router.put('/vehicules/:id/mode', adminController.setMode);
router.put('/vehicules/:id/speed-limit', adminController.setSpeedLimit);
router.put('/vehicules/:id/geofence', adminController.setGeofence);
router.put('/vehicules/:id/telephone-alerte', adminController.setPhoneAlerte);

router.get('/alarmes', adminController.getAlarmes);
router.patch('/alarmes/:alarmeId/acquit', adminController.acquitAlarme);
router.delete('/alarmes/:alarmeId', adminController.deleteAlarme);

router.get('/stats/overview', adminController.getStatsOverview);

export default router;
