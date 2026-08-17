// Fuseau opérationnel (Africa/Douala, UTC+1, sans heure d'été). Tout
// découpage "jour" (aujourd'hui, rapport journalier, séries temporelles,
// historique de positions) DOIT passer par ces helpers pour rester aligné
// sur les CRON (scheduler.ts, option `timezone: 'Africa/Douala'`) — un calcul
// de bornes de journée en heure LOCALE DU PROCESS serveur (souvent UTC en
// production) décale la fenêtre agrégée d'environ 1h par rapport au vrai
// jour calendaire vécu par les utilisateurs.
export const TZ_OFFSET_MIN = 60;

// Début (00:00 heure de Douala) d'un jour calendaire "YYYY-MM-DD", exprimé
// en UTC.
export const dayStartUtc = (isoDate: string): Date => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - TZ_OFFSET_MIN * 60_000);
};

// Bornes [début, fin] (23:59:59.999 heure de Douala) d'un jour calendaire.
export const dayBounds = (isoDate: string): { start: Date; end: Date } => {
  const start = dayStartUtc(isoDate);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) };
};

// "YYYY-MM-DD" du jour calendaire actuel à Douala. Utilise les méthodes UTC
// (pas getDate()/setDate() locaux) pour rester déterministe quel que soit le
// fuseau du process serveur.
export const jourAujourdhui = (): string =>
  new Date(Date.now() + TZ_OFFSET_MIN * 60_000).toISOString().slice(0, 10);

// "YYYY-MM-DD" du jour calendaire à Douala, décalé de `offsetJours` jours
// (négatif = passé, ex. -1 = hier).
export const jourDecale = (offsetJours: number): string => {
  const shifted = new Date(Date.now() + TZ_OFFSET_MIN * 60_000);
  shifted.setUTCDate(shifted.getUTCDate() + offsetJours);
  return shifted.toISOString().slice(0, 10);
};
