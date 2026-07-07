import { Trame, TramePosition, TrameEvent, TrameHeartbeat } from '../types/tracker.types';

const isValidCoord = (lat: number, lon: number): boolean =>
  lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

const isValidIdentifier = (id: string): boolean =>
  /^\d{15}$/.test(id) || /^[A-Z0-9\-]{5,30}$/i.test(id);

export const validateTrame = (trame: Trame): { valid: boolean; reason?: string } => {
  if (!isValidIdentifier(trame.imei)) {
    return { valid: false, reason: `Identifiant traceur invalide : ${trame.imei}` };
  }

  if (trame.type === 'POSITION') {
    const t = trame as TramePosition;
    if (!isValidCoord(t.lat, t.lon)) {
      return { valid: false, reason: `Coordonnées invalides : ${t.lat}, ${t.lon}` };
    }
    if (t.speed < 0 || t.speed > 300) {
      return { valid: false, reason: `Vitesse invalide : ${t.speed}` };
    }
    if (t.battery < 0 || t.battery > 100) {
      return { valid: false, reason: `Batterie invalide : ${t.battery}` };
    }
  }

  if (trame.type === 'EVENT') {
    const t = trame as TrameEvent;
    const validEvents = [
      'SORTIE_ZONE', 'VITESSE_EXCESSIVE',
      'DECOLLEMENT_TRACEUR', 'NON_MOUVEMENT', 'BATTERIE_FAIBLE'
    ];
    if (!validEvents.includes(t.event)) {
      return { valid: false, reason: `Événement inconnu : ${t.event}` };
    }
    if (!isValidCoord(t.lat, t.lon)) {
      return { valid: false, reason: `Coordonnées invalides` };
    }
  }

  // Horodatage : refuser les trames trop anciennes (> 10 min)
  const age = Date.now() - trame.ts;
  if (age > 10 * 60 * 1000) {
    console.warn(`[VALIDATOR] Trame ancienne (${Math.round(age / 1000)}s) — acceptée quand même (zone morte)`);
  }

  return { valid: true };
};