"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendReportNotifications = void 0;
const database_1 = require("../config/database");
const mail_service_1 = require("../services/mail.service");
/**
 * Envoie les notifications (email) pour tous les rapports
 * générés lors d'une journée donnée
 */
const sendReportNotifications = async (date) => {
    const dateStr = date.toISOString().split('T')[0];
    console.log(`[NOTIF] Envoi des notifications pour le ${dateStr}`);
    // Récupère tous les rapports du jour avec les infos utilisateur
    const rapports = await database_1.prisma.rapportJournalier.findMany({
        where: {
            date: new Date(dateStr),
        },
        include: {
            vehicule: {
                include: {
                    utilisateur: {
                        select: {
                            email: true,
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
    const results = await Promise.allSettled(rapports
        .filter((rapport) => rapport.vehicule.utilisateur !== null)
        .map((rapport) => (0, mail_service_1.sendReportEmail)({
        toEmail: rapport.vehicule.utilisateur.email,
        userName: rapport.vehicule.utilisateur.userName,
        vehicleName: rapport.vehicule.nom,
        date: dateStr,
        distanceTotaleKm: rapport.distanceTotaleKm,
        vitesseMoyenne: rapport.vitesseMoyenne,
        vitesseMax: rapport.vitesseMax,
        nbAlarmes: rapport.nbAlarmes,
        tempsArretMinutes: rapport.tempsArretMinutes,
    })));
    const success = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    console.log(`[NOTIF] ${success} email(s) envoyé(s), ${failed} échec(s)`);
};
exports.sendReportNotifications = sendReportNotifications;
