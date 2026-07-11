import { Trame, TramePosition, TrameEvent } from '../types/tracker.types';

// Exportées pour être réutilisées par les canaux HTTP/SMS (tracker.routes.ts),
// qui doivent appliquer les mêmes bornes que le canal TCP plutôt que d'avoir
// leur propre logique de validation divergente.
export const isValidCoord = (lat: number, lon: number): boolean =>
  lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;

export const isValidSpeed = (speed: number): boolean =>
  speed >= 0 && speed <= 300;

export const isValidBattery = (battery: number): boolean =>
  battery >= 0 && battery <= 100;

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
    if (!isValidSpeed(t.speed)) {
      return { valid: false, reason: `Vitesse invalide : ${t.speed}` };
    }
    if (!isValidBattery(t.battery)) {
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

  // Horodatage : signaler les trames trop anciennes (> 10 min), sans les
  // rejeter (cas fréquent en zone de couverture réseau intermittente).
  const trameTime = new Date(trame.ts).getTime();
  const age = Number.isNaN(trameTime) ? 0 : Date.now() - trameTime;
  if (age > 10 * 60 * 1000) {
    console.warn(`[VALIDATOR] Trame ancienne (${Math.round(age / 1000)}s) — acceptée quand même (zone morte)`);
  }

  return { valid: true };
};