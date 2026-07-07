import{ prisma }from '../config/database';
import { sendReportEmail } from '../services/mail.service';

/**
 * Envoie les notifications (email) pour tous les rapports
 * générés lors d'une journée donnée
 */
export const sendReportNotifications = async (date: Date): Promise<void> => {
  const dateStr = date.toISOString().split('T')[0];

  console.log(`[NOTIF] Envoi des notifications pour le ${dateStr}`);

  // Récupère tous les rapports du jour avec les infos utilisateur
  const rapports = await prisma.rapportJournalier.findMany({
    where: {
      date: new Date(dateStr),
    },
    include: {
      vehicule: {
        include: {
          utilisateur: {
            select: {
              email:    true,
              userName: true,
            },
          },
        },
      },
    },
  });

  if (rapports.length === 0) {
    console.log('[NOTIF] Aucun rapport à notifier.');
    return;
  }

  // Envoyer les emails en parallèle
  const results = await Promise.allSettled(
    rapports
      .filter((rapport) => rapport.vehicule.utilisateur !== null)
      .map((rapport) =>
        sendReportEmail({
          toEmail:          rapport.vehicule.utilisateur!.email,
          userName:         rapport.vehicule.utilisateur!.userName,
          vehicleName:      rapport.vehicule.nom,
          date:             dateStr,
          distanceTotaleKm:  rapport.distanceTotaleKm,
          vitesseMoyenne:    rapport.vitesseMoyenne,
          vitesseMax:        rapport.vitesseMax,
          nbAlarmes:         rapport.nbAlarmes,
          tempsArretMinutes: rapport.tempsArretMinutes,
        })
      )
  );

  const success = results.filter(r => r.status === 'fulfilled').length;
  const failed  = results.filter(r => r.status === 'rejected').length;

  console.log(`[NOTIF] ${success} email(s) envoyé(s), ${failed} échec(s)`);
};