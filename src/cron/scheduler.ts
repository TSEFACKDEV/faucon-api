import cron from 'node-cron';
import { generateAllReports } from './report.generator';
import { sendReportNotifications } from './notification.sender';
import {prisma} from '../config/database'; // Import statique corrigé

/**
 * Lance tous les CRON jobs de l'application
 */
export const startCronJobs = (): void => {

  // ── RAPPORT JOURNALIER ──────────────────────────────────────────
  // Chaque nuit à 00:05 (5 min après minuit pour laisser arriver
  // les dernières trames de la journée précédente)
  cron.schedule('5 0 * * *', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    console.log('\n[CRON] ⏰ Déclenchement rapport journalier...');

    try {
      // 1. Générer tous les rapports
      await generateAllReports(yesterday);

      // 2. Envoyer les notifications email
      await sendReportNotifications(yesterday);
    } catch (err) {
      console.error('[CRON] Erreur fatale :', err);
    }
  }, {
    timezone: 'Africa/Douala',
  });

  // ── NETTOYAGE TOKENS EXPIRÉS ────────────────────────────────────
  // Chaque dimanche à 03:00
  cron.schedule('0 3 * * 0', async () => {
    console.log('[CRON] 🧹 Nettoyage des refresh tokens expirés...');
    try {
      const result = await prisma.refreshToken.deleteMany({
        where: { dateExpiration: { lt: new Date() } },
      });
      console.log(`[CRON] ${result.count} token(s) expiré(s) supprimé(s)`);
    } catch (err) {
      console.error('[CRON] Erreur nettoyage tokens :', err);
    }
  }, {
    timezone: 'Africa/Douala',
  });

  // ── DÉTECTION NON-MOUVEMENT ─────────────────────────────────────
  // Toutes les heures : vérifie si un véhicule actif n'a pas bougé
  // depuis plus de 2 heures sans alarme déjà créée
  cron.schedule('0 * * * *', async () => {
    console.log('[CRON] 📡 Vérification non-mouvement...');
    try {
      await checkNonMouvement();
    } catch (err) {
      console.error('[CRON] Erreur vérification non-mouvement :', err);
    }
  }, {
    timezone: 'Africa/Douala',
  });

  console.log('⏰ CRON jobs démarrés (fuseau : Africa/Douala)');
};

/**
 * Détecte les véhicules qui n'ont pas envoyé de position
 * depuis plus de 2 heures
 */
const checkNonMouvement = async (): Promise<void> => {
  const deuxHeuresAvant = new Date(Date.now() - 2 * 60 * 60 * 1000);

  const vehiculesInactifs = await prisma.vehicule.findMany({
    where: {
      estActif: true,
      derniereCommunication: { lt: deuxHeuresAvant },
    },
    select: { id: true, imei: true, nom: true },
  });

  for (const vehicule of vehiculesInactifs) {
    // Vérifier qu'il n'y a pas déjà une alarme NON_MOUVEMENT
    // non acquittée dans les 3 dernières heures
    const existing = await prisma.alarme.findFirst({
      where: {
        vehiculeId:   vehicule.id,
        typeAlarme:   'NON_MOUVEMENT',
        estAcquittee: false,
        horodatage:   { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) },
      },
    });

    if (existing) continue;

    const dernierePosition = await prisma.position.findFirst({
      where: { vehiculeId: vehicule.id },
      orderBy: { horodatage: 'desc' },
      select: { latitude: true, longitude: true },
    });

    await prisma.alarme.create({
      data: {
        vehiculeId:  vehicule.id,
        typeAlarme:  'NON_MOUVEMENT',
        latitude:    dernierePosition?.latitude ?? 0,
        longitude:   dernierePosition?.longitude ?? 0,
        horodatage:  new Date(),
      },
    });

    console.warn(`[CRON] NON_MOUVEMENT détecté — ${vehicule.nom} (${vehicule.imei})`);
  }
};