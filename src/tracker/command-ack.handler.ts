import { prisma } from '../config/database';
import { broadcastCommandUpdate, broadcastVehicleMode } from './websocket.service';

const MODES_VALIDES = ['WORK', 'MOVE', 'STANDBY'] as const;
type ModeFonctionnement = (typeof MODES_VALIDES)[number];

const estModeValide = (valeur: unknown): valeur is ModeFonctionnement =>
  typeof valeur === 'string' && (MODES_VALIDES as readonly string[]).includes(valeur);

// Traite l'accusé de réception MQTT d'une commande descendante (cf.
// commandTracker.service.ts / mqtt.client.ts:handleAckMessage). `commandeId`
// est l'identifiant de la ligne CommandeDescendante que le firmware a
// recopié tel quel dans son message — c'est ce qui permet de retrouver la
// bonne commande sans ambiguïté, même si plusieurs sont en attente.
export const handleCommandAck = async (
  commandeId: string,
  ok: boolean,
  detail?: string
): Promise<void> => {
  const commande = await prisma.commandeDescendante.findUnique({ where: { id: commandeId } });
  if (!commande) {
    console.warn(`[CMD] Accusé reçu pour une commande inconnue : ${commandeId}`);
    return;
  }
  // Déjà résolue (par exemple marquée TIMEOUT par le cron entre-temps) :
  // un accusé tardif ne doit pas écraser ce statut.
  if (commande.statutExecution !== 'PENDING') return;

  const parametresExistants =
    commande.parametres && typeof commande.parametres === 'object'
      ? (commande.parametres as Record<string, unknown>)
      : {};

  const updated = await prisma.commandeDescendante.update({
    where: { id: commandeId },
    data: {
      statutExecution: ok ? 'SUCCESS' : 'FAILED',
      dateReponse: new Date(),
      ...(detail ? { parametres: { ...parametresExistants, detail } as any } : {}),
    },
  });

  // Un ACK de MODE / MODE? porte le mode réellement appliqué par le traceur
  // dans `detail`. On resynchronise la base avec cette valeur : c'est la
  // seule source de vérité (la base pouvait être optimiste après un envoi
  // resté sans réponse, ou périmée après un reset du traceur). Les autres
  // commandes ne touchont pas au mode.
  if (
    ok &&
    (commande.codeCommande === 'MODE' || commande.codeCommande === 'MODE?') &&
    estModeValide(detail)
  ) {
    await prisma.vehicule.update({
      where: { id: commande.vehiculeId },
      data: { modeActuel: detail },
    });
    broadcastVehicleMode(commande.vehiculeId, detail);
    console.log(`[CMD] Mode resynchronisé pour le véhicule ${commande.vehiculeId} : ${detail}`);
  }

  broadcastCommandUpdate(commande.vehiculeId, updated);
  console.log(`[CMD] Accusé traité : ${commande.codeCommande} (${commandeId}) -> ${updated.statutExecution}`);
};
