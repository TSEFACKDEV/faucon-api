import { prisma } from '../config/database';
import { findVehiculeByIdentifier } from '../services/vehicle-lookup.service';
import { broadcastVehicleMode, broadcastDiagnostic } from './websocket.service';

// Diagnostic périodique publié par le firmware v12.1 sur
// faucon/<trackerId>/diag (toutes les 5 minutes — cf. publierDiag dans
// faucon_v12.ino). C'est la seule source d'état réel du boîtier :
//
//   { "positionsPerdues":0, "fileNombre":0, "causeReset":"normal",
//     "resetCode":1, "dernierArret":"?", "wd":0, "br":0, "pan":0,
//     "fixValide":true, "fixPerime":false, "ageFix":12, "sat":9, "hdop":1.2,
//     "bat":85, "sig":70, "sigValide":true, "i2c":0, "i2cSuspendu":false,
//     "journal":true, "mode":"WORK", "modele":"FAUCON-C3-72x40",
//     "version":"v12.1", "sourceHeure":"gps", "heap":180000 }
//
// Deux usages :
//  1. resynchroniser le mode du véhicule sur le mode RÉELLEMENT appliqué
//     (indispensable : le champ modeActuel en base peut être optimiste —
//     une commande envoyée mais pas encore acquittée — ou périmé après un
//     reset du traceur) ;
//  2. conserver l'historique de santé, exploité par l'app (fiche véhicule).
//
// Les champs absents restent null : on ne fabrique jamais une valeur.

const MODES_VALIDES = ['WORK', 'MOVE', 'STANDBY'];

// Nombre de diagnostics conservés par traceur (le plus récent gagne).
// Au-delà, la table grossirait indéfiniment (un diag toutes les 5 min
// = ~105 000 lignes/an et par traceur).
const DIAGNOSTICS_CONSERVES = 200;

// Purge déclenchée au plus une fois par heure (tous les traceurs) : un
// delete par diag reçu serait inutile, le volume est faible.
let dernierePurge = 0;

const purgerDiagnosticsAnciens = async (): Promise<void> => {
  const maintenant = Date.now();
  if (maintenant - dernierePurge < 3600_000) return;
  dernierePurge = maintenant;
  try {
    // Suppression des diagnostics de plus de 30 jours (garde-fou si un
    // traceur continue d'émettre alors qu'il n'est plus suivi).
    await prisma.diagnosticTraceur.deleteMany({
      where: { horodatage: { lt: new Date(maintenant - 30 * 24 * 3600 * 1000) } },
    });
  } catch (err) {
    console.warn('[DIAG] Purge impossible :', (err as Error).message);
  }
};

const nombreOuNull = (valeur: unknown): number | null => {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return null;
  return valeur;
};

const texteOuNull = (valeur: unknown): string | null => {
  if (typeof valeur !== 'string') return null;
  const v = valeur.trim();
  return v.length > 0 ? v : null;
};

export const handleDiagMessage = async (
  trackerId: string,
  payloadBuffer: Buffer
): Promise<void> => {
  let payload: any;
  try {
    payload = JSON.parse(payloadBuffer.toString());
  } catch {
    console.warn(`[DIAG] Payload JSON invalide pour ${trackerId}`);
    return;
  }

  const device = await findVehiculeByIdentifier(trackerId);
  if (!device) {
    console.warn(`[DIAG] Traceur inconnu : ${trackerId}`);
    return;
  }

  const mode = texteOuNull(payload.mode);
  const modeValide = mode && MODES_VALIDES.includes(mode) ? mode : null;

  const diagnostic = await prisma.diagnosticTraceur.create({
    data: {
      vehiculeId: device.id,
      modele:       texteOuNull(payload.modele),
      version:      texteOuNull(payload.version),
      mode:         modeValide,

      causeReset:   texteOuNull(payload.causeReset),
      resetCode:    nombreOuNull(payload.resetCode),
      dernierArret: texteOuNull(payload.dernierArret),
      nbWatchdog:   nombreOuNull(payload.wd) ?? 0,
      nbBrownout:   nombreOuNull(payload.br) ?? 0,
      nbPanique:    nombreOuNull(payload.pan) ?? 0,

      fixValide:      payload.fixValide === true,
      fixPerime:      payload.fixPerime === true,
      ageFixSecondes: nombreOuNull(payload.ageFix),
      satellites:     nombreOuNull(payload.sat),
      hdop:           typeof payload.hdop === 'number' ? payload.hdop : null,

      batteriePct:  nombreOuNull(payload.bat),
      signalPct:    nombreOuNull(payload.sig),
      signalValide: payload.sigValide === true,

      i2cRecuperations: nombreOuNull(payload.i2c) ?? 0,
      i2cSuspendu:      payload.i2cSuspendu === true,
      journalOk:        payload.journal === true,
      positionsPerdues: nombreOuNull(payload.positionsPerdues) ?? 0,
      fileNombre:       nombreOuNull(payload.fileNombre),
      sourceHeure:      texteOuNull(payload.sourceHeure),
      heapLibre:        nombreOuNull(payload.heap),

      // Payload complet : le modèle ne peut pas anticiper tous les champs
      // que le firmware pourra ajouter, et l'historique doit rester faithful.
      brut: payload,
    },
  });

  // Resynchronisation du mode : le diag est envoyé toutes les 5 minutes,
  // c'est donc un garde-fou régulier — la commande MODE? reste le moyen
  // immédiat de confirmation.
  if (modeValide && device.modeActuel !== modeValide) {
    await prisma.vehicule.update({
      where: { id: device.id },
      data: { modeActuel: modeValide as any },
    });
    broadcastVehicleMode(device.id, modeValide);
    console.log(`[DIAG] Mode resynchronisé pour ${trackerId} : ${modeValide}`);
  }

  // Diffusion temps réel : l'app affiche l'état de santé sans polling.
  broadcastDiagnostic(device.id, {
    vehiculeId:  device.id,
    id:          diagnostic.id,
    horodatage:  diagnostic.horodatage,
    modele:      diagnostic.modele,
    version:     diagnostic.version,
    mode:        diagnostic.mode,
    causeReset:  diagnostic.causeReset,
    dernierArret: diagnostic.dernierArret,
    nbWatchdog:  diagnostic.nbWatchdog,
    nbBrownout:  diagnostic.nbBrownout,
    nbPanique:   diagnostic.nbPanique,
    fixValide:   diagnostic.fixValide,
    fixPerime:   diagnostic.fixPerime,
    ageFixSecondes: diagnostic.ageFixSecondes,
    satellites:  diagnostic.satellites,
    hdop:        diagnostic.hdop,
    batteriePct: diagnostic.batteriePct,
    signalPct:   diagnostic.signalPct,
    signalValide: diagnostic.signalValide,
    i2cRecuperations: diagnostic.i2cRecuperations,
    i2cSuspendu:  diagnostic.i2cSuspendu,
    journalOk:   diagnostic.journalOk,
    positionsPerdues: diagnostic.positionsPerdues,
    fileNombre:  diagnostic.fileNombre,
    sourceHeure: diagnostic.sourceHeure,
    heapLibre:   diagnostic.heapLibre,
  });

  await purgerDiagnosticsAnciens();
  console.log(`[DIAG] Diagnostic enregistré pour ${trackerId} (mode ${modeValide ?? '?'})`);
};
