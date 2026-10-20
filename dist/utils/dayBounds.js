"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jourDecale = exports.jourAujourdhui = exports.dayBounds = exports.dayStartUtc = exports.TZ_OFFSET_MIN = void 0;
// Fuseau opérationnel (Africa/Douala, UTC+1, sans heure d'été). Tout
// découpage "jour" (aujourd'hui, rapport journalier, séries temporelles,
// historique de positions) DOIT passer par ces helpers pour rester aligné
// sur les CRON (scheduler.ts, option `timezone: 'Africa/Douala'`) — un calcul
// de bornes de journée en heure LOCALE DU PROCESS serveur (souvent UTC en
// production) décale la fenêtre agrégée d'environ 1h par rapport au vrai
// jour calendaire vécu par les utilisateurs.
exports.TZ_OFFSET_MIN = 60;
// Début (00:00 heure de Douala) d'un jour calendaire "YYYY-MM-DD", exprimé
// en UTC.
const dayStartUtc = (isoDate) => {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) - exports.TZ_OFFSET_MIN * 60000);
};
exports.dayStartUtc = dayStartUtc;
// Bornes [début, fin] (23:59:59.999 heure de Douala) d'un jour calendaire.
const dayBounds = (isoDate) => {
    const start = (0, exports.dayStartUtc)(isoDate);
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) };
};
exports.dayBounds = dayBounds;
// "YYYY-MM-DD" du jour calendaire actuel à Douala. Utilise les méthodes UTC
// (pas getDate()/setDate() locaux) pour rester déterministe quel que soit le
// fuseau du process serveur.
const jourAujourdhui = () => new Date(Date.now() + exports.TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);
exports.jourAujourdhui = jourAujourdhui;
// "YYYY-MM-DD" du jour calendaire à Douala, décalé de `offsetJours` jours
// (négatif = passé, ex. -1 = hier).
const jourDecale = (offsetJours) => {
    const shifted = new Date(Date.now() + exports.TZ_OFFSET_MIN * 60000);
    shifted.setUTCDate(shifted.getUTCDate() + offsetJours);
    return shifted.toISOString().slice(0, 10);
};
exports.jourDecale = jourDecale;
