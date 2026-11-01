import mqtt, { MqttClient } from 'mqtt';
import crypto from 'crypto';
import { handlePositionPayload } from './position.handler';
import { findVehiculeByIdentifier } from '../services/vehicle-lookup.service';
import { isValidCoord, isValidSpeed, isValidBattery } from './trame.validator';
import { handleCommandAck } from './command-ack.handler';
import { handleDiagMessage } from './diag.handler';
import { mapTrackerEvent } from './event-codes';

let client: MqttClient | null = null;

// Clé HMAC-SHA256 partagée avec le firmware (CMD_SIGN_KEY dans le .ino).
// Utilisée pour signer les commandes descendantes et vérifier les ACK.
const CMD_SIGN_KEY = process.env.COMMAND_SIGNING_KEY ?? '';

const computeHmac = (data: string): string => {
  if (!CMD_SIGN_KEY) return '';
  return crypto.createHmac('sha256', CMD_SIGN_KEY).update(data).digest('hex');
};

// Convertit un champ optionnel en nombre sans transformer null/vide en 0.
// Important pour signal/satellites/cap : une valeur absente doit rester
// absente (et ne pas écraser la dernière valeur connue côté app).
const toOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

// ────────────────────────────────────────────────────────────────────────
// Canal « raw » (ce que publie réellement le firmware, cf. publierBrut dans
// l'ino) :
//   topic : faucon/<trackerId>/raw
//   payload : id;lat;lon;bat;spd;ts;evt;value;threshold;sat;sig;cap
//
//   - id          identifiant du traceur (trackerId, ex "FCN-0733")
//   - lat / lon   coordonnées GPS (degrés décimaux)
//   - bat         batterie en % (entier)
//   - spd         vitesse en km/h
//   - ts          horodatage UTC ISO 8601
//   - evt         code numérique d'événement (1..5), vide si aucun
//   - value/threshold  valeurs numériques de l'événement (0 si non renseigné)
//   - sat / sig / cap satellites, signal %, cap — optionnels, vides possible
//
//   Le firmware actuel (publierBrut, faucon_v12.ino) envoie 12 champs à
//   position fixe — evt/value/threshold sont vides (";;;") plutôt qu'omis
//   quand il n'y a pas d'événement, idem pour sat/sig/cap absents.
//   Certaines versions du firmware ajoutent des champs après les 12 champs
//   standards (mode, état, compteur...). On lit donc les 12 premiers champs
//   par position fixe et on ignore les champs supplémentaires au lieu de
//   perdre satellites/signal/cap. Une trame à 11 champs est traitée comme
//   une trame 12 champs dont le dernier (cap) est absent. Les trames plus
//   courtes restent limitées au socle id..ts : en dessous de 11 champs, le
//   format est ambigu et deviner sat/sig/cap risquerait de corrompre les
//   données.
const parseRawPayload = (payload: string): Record<string, string | undefined> | null => {
  const parts = payload.split(';');
  if (parts.length < 6) return null;

  const read = (i: number): string | undefined => {
    const v = parts[i];
    return v !== undefined && v.trim() !== '' ? v.trim() : undefined;
  };

  const core = {
    id:  read(0), lat: read(1), lon: read(2),
    bat: read(3), spd: read(4), ts:  read(5),
  };

  if (parts.length >= 12) {
    return {
      ...core,
      evt: read(6), value: read(7), threshold: read(8),
      sat: read(9), sig: read(10), cap: read(11),
      // Champ ajouté par le firmware du 1er novembre 2026 :
      // 1 = collé, 0 = décollé, -1/absent = inconnu.
      colle: read(12),
    };
  }

  if (parts.length === 11 || parts.length === 12) {
    // Ancienne trame sans le champ cap et/ou sans l'état Hall.
    return {
      ...core,
      evt: read(6), value: read(7), threshold: read(8),
      sat: read(9), sig: read(10), cap: read(11), colle: undefined,
    };
  }

  if (parts.length !== 6) {
    console.warn(`[MQTT] Trame raw de longueur inattendue (${parts.length} champs) — seuls id/lat/lon/bat/spd/ts sont retenus : ${payload.slice(0, 120)}`);
  }
  return {
    ...core,
    evt: undefined, value: undefined, threshold: undefined,
    sat: undefined, sig: undefined, cap: undefined,
  };
};

const handleRawMessage = async (trackerId: string, payloadBuffer: Buffer): Promise<void> => {
  const raw = parseRawPayload(payloadBuffer.toString());
  if (!raw || !raw.id || raw.lat === undefined || raw.lon === undefined || raw.bat === undefined) {
    console.warn(`[MQTT] Trame raw invalide pour ${trackerId} :`, payloadBuffer.toString().slice(0, 120));
    return;
  }

  const lat = Number(raw.lat);
  const lon = Number(raw.lon);
  const bat = Number(raw.bat);
  const spd = raw.spd !== undefined ? Number(raw.spd) : 0;

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(bat)) {
    console.warn(`[MQTT] Champs non numériques pour ${trackerId}`);
    return;
  }
  if (!isValidCoord(lat, lon) || !isValidBattery(bat) || !isValidSpeed(spd)) {
    console.warn(`[MQTT] Valeurs hors plage pour ${trackerId} : lat=${lat} lon=${lon} bat=${bat} spd=${spd}`);
    return;
  }

  const device = await findVehiculeByIdentifier(raw.id);
  if (!device) {
    console.warn(`[MQTT] Traceur inconnu : ${raw.id}`);
    return;
  }

  const ts = raw.ts ? new Date(raw.ts) : new Date();
  const capN = toOptionalNumber(raw.cap);
  const satN = toOptionalNumber(raw.sat);
  const sigN = toOptionalNumber(raw.sig);
  const evtCode = raw.evt?.trim();

  // Événement 6 = traceur recollé (nouveau firmware). Ce n'est pas une
  // alarme : on met simplement à jour l'état du support. Les événements 1
  // (décollé) restent des alarmes.
  const colleFromEvent =
    evtCode === '6' ? true : evtCode === '1' ? false : undefined;
  const colleField =
    raw.colle === '1' ? true : raw.colle === '0' ? false : undefined;
  const colle = colleFromEvent ?? colleField;

  await handlePositionPayload(device.id, {
    latitude:  lat,
    longitude: lon,
    vitesse:   spd,
    cap:       capN,
    battery:   bat,
    satellites: satN,
    signal:     sigN,
    timestamp: ts,
    source:    'mqtt',
    colle,
    eventType: evtCode === '6' ? undefined : mapTrackerEvent(raw.evt),
    eventValue:     raw.value !== undefined ? Number(raw.value) : undefined,
    eventThreshold: raw.threshold !== undefined ? Number(raw.threshold) : undefined,
  });

  console.log(`[MQTT] Position raw traitée pour ${raw.id} (topic ${trackerId})`);
};

// Canal « data » : format JSON documenté pour un relais éventuel
// (ex. mqtt_relay.js) qui aurait déjà converti la trame brute en JSON.
//   topic : faucon/<trackerId>/data
//   payload : { "lat":4.09, "lon":9.80, "bat":85, "spd":12.3, "ts":"2026-...",
//               "sat":8, "sig":72, "cap":214.9, "evt":"2", "value":15, "threshold":20 }
const handleDataMessage = async (trackerId: string, payloadBuffer: Buffer): Promise<void> => {
  let payload: any;
  try {
    payload = JSON.parse(payloadBuffer.toString());
  } catch {
    console.warn(`[MQTT] Payload JSON invalide pour ${trackerId}`);
    return;
  }

  const lat = Number(payload.lat);
  const lon = Number(payload.lon);
  const bat = Number(payload.bat);
  const spd = payload.spd !== undefined ? Number(payload.spd) : 0;
  const ts  = payload.ts ? new Date(payload.ts) : new Date();

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(bat)) {
    console.warn(`[MQTT] Champs manquants/non numériques pour ${trackerId}`);
    return;
  }
  if (!isValidCoord(lat, lon) || !isValidBattery(bat) || !isValidSpeed(spd)) {
    console.warn(`[MQTT] Valeurs hors plage pour ${trackerId} : lat=${lat} lon=${lon} bat=${bat} spd=${spd}`);
    return;
  }

  const device = await findVehiculeByIdentifier(trackerId);
  if (!device) {
    console.warn(`[MQTT] Traceur inconnu : ${trackerId}`);
    return;
  }

  const sat = toOptionalNumber(payload.sat);
  const sig = toOptionalNumber(payload.sig);
  const cap = toOptionalNumber(payload.cap);

  await handlePositionPayload(device.id, {
    latitude:  lat,
    longitude: lon,
    vitesse:   spd,
    cap:       cap,
    battery:   bat,
    satellites: sat,
    signal:     sig,
    timestamp: ts,
    source:    'mqtt',
    eventType: mapTrackerEvent(payload.evt),
    eventValue:     payload.value     !== undefined ? Number(payload.value)     : undefined,
    eventThreshold: payload.threshold !== undefined ? Number(payload.threshold) : undefined,
  });

  console.log(`[MQTT] Position data traitée pour ${trackerId}`);
};

// Topic : faucon/<trackerId>/ack — réponse du traceur à une commande
// descendante. Payload attendu :
//   { "id": "<uuid CommandeDescendante>", "cmd": "...", "ok": true/false,
//     "detail": "...", "trackerId": "...", "sig": "<hmac-sha256>" }
const handleAckMessage = async (trackerId: string, payloadBuffer: Buffer): Promise<void> => {
  if (!trackerId) return;

  let payload: any;
  try {
    payload = JSON.parse(payloadBuffer.toString());
  } catch {
    console.warn(`[MQTT] Accusé de commande JSON invalide pour ${trackerId}`);
    return;
  }

  if (!payload.id || typeof payload.id !== 'string') return;

  // Vérification HMAC du ACK (signé par le firmware avec CMD_SIGN_KEY).
  // Le serveur vérifie que leACK vient bien du traceur légitime et n'a pas
  // été injecté par un subscriber MQTT malveillant.
  if (payload.sig && CMD_SIGN_KEY) {
    const aVerifier = `${payload.ok ? 1 : 0}|${payload.detail ?? ''}`;
    const sigCalculee = computeHmac(aVerifier);
    if (sigCalculee && payload.sig !== sigCalculee) {
      console.warn(`[MQTT] ACK falsifié pour ${trackerId} (cmd ${payload.id}) — signature invalide`);
      return;
    }
  }

  await handleCommandAck(payload.id, !!payload.ok, payload.detail ? String(payload.detail) : undefined);
};

// Publie une commande descendante vers un traceur. Retourne false si le
// canal MQTT n'est pas connecté (l'appelant doit alors marquer la
// commande FAILED plutôt que de la laisser PENDING indéfiniment).
export const publishCommand = (trackerId: string, payload: { id: string; cmd: string; valeur?: string }): boolean => {
  if (!client || !client.connected) return false;

  // Signature HMAC : le firmware vérifie cette signature avant d'exécuter
  // la commande, pour empêcher l'injection par un subscriber MQTT
  // malveillant. Le payload signé est "cmd|valeur" (ou juste "cmd" si pas
  // de valeur).
  const aSigner = payload.valeur ? `${payload.cmd}|${payload.valeur}` : payload.cmd;
  const sig = computeHmac(aSigner);

  const signedPayload = { ...payload, sig };
  client.publish(`faucon/${trackerId}/cmd`, JSON.stringify(signedPayload), { qos: 1 });
  return true;
};

export const startMqttClient = (): void => {
  const url = process.env.MQTT_BROKER_URL;
  if (!url) {
    // MQTT est le canal PRINCIPAL du firmware (HTTP/SMS ne sont que des
    // canaux de secours) — un oubli de configuration ici coupe l'essentiel
    // du flux temps réel silencieusement. Reste non-fatal (un déploiement
    // TCP/HTTP-only est possible) mais le signal doit être impossible à
    // manquer dans les logs de démarrage.
    console.error('╔═══════════════════════════════════════════════════════════════╗');
    console.error('║  [MQTT] MQTT_BROKER_URL absente — canal MQTT DÉSACTIVÉ.         ║');
    console.error('║  Le firmware publie principalement via MQTT : sans ce canal,    ║');
    console.error('║  seuls les canaux de secours HTTP/SMS resteront actifs.         ║');
    console.error('╚═══════════════════════════════════════════════════════════════╝');
    return;
  }

  client = mqtt.connect(url, {
    username:        process.env.MQTT_BACKEND_USERNAME,
    password:        process.env.MQTT_BACKEND_PASSWORD,
    clientId:        `faucon-backend-${Math.random().toString(16).slice(2)}`,
    reconnectPeriod: 5000,
  });

  client.on('connect', () => {
    console.log('📡 MQTT connecté au broker');
    // `raw` = format natif du firmware. On ne s'abonne plus à `data` : le
    // relais historique republiait chaque trame raw sur data, ce qui faisait
    // traiter deux fois chaque position (et perdre des événements).
    client!.subscribe('faucon/+/raw', { qos: 1 }, (err) => {
      if (err) console.error('[MQTT] Erreur abonnement raw :', err);
      else console.log('[MQTT] Abonné à faucon/+/raw');
    });
    client!.subscribe('faucon/+/ack', { qos: 1 }, (err) => {
      if (err) console.error('[MQTT] Erreur abonnement ack :', err);
      else console.log('[MQTT] Abonné à faucon/+/ack');
    });
    // Canal "diag" : diagnostic périodique du firmware v12.1 (état de santé
    // du boîtier toutes les 5 minutes + mode réellement appliqué).
    client!.subscribe('faucon/+/diag', { qos: 1 }, (err) => {
      if (err) console.error('[MQTT] Erreur abonnement diag :', err);
      else console.log('[MQTT] Abonné à faucon/+/diag');
    });
  });

  client.on('message', (topic, payloadBuffer) => {
    // Topic : faucon/<trackerId>/<suffix> — le trackerId du canal est extrait
    // du topic ; pour le canal raw, l'identifiant relu dans le payload fait
    // foi (le firmware y répète l'identifiant du traceur).
    const parts = topic.split('/');
    const trackerId = parts.length >= 3 ? parts[1] : topic;

    if (topic.endsWith('/ack')) {
      handleAckMessage(trackerId, payloadBuffer).catch((err) => console.error('[MQTT] Erreur traitement ack :', err));
      return;
    }
    if (topic.endsWith('/diag')) {
      handleDiagMessage(trackerId, payloadBuffer).catch((err) => console.error('[MQTT] Erreur traitement diag :', err));
      return;
    }
    if (topic.endsWith('/raw')) {
      handleRawMessage(trackerId, payloadBuffer).catch((err) => console.error('[MQTT] Erreur traitement raw :', err));
      return;
    }
    // Ancien canal JSON du relais : ignoré (le relais n'est plus utilisé).
    console.warn(`[MQTT] Topic ignoré : ${topic}`);
  });

  client.on('error', (err) => console.error('[MQTT] Erreur connexion :', err));
  client.on('reconnect', () => console.log('[MQTT] Reconnexion en cours...'));
};
