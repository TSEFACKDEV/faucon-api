import { prisma } from '../config/database';
import { broadcastCommandUpdate } from './websocket.service';

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

  broadcastCommandUpdate(commande.vehiculeId, updated);
  console.log(`[CMD] Accusé traité : ${commande.codeCommande} (${commandeId}) -> ${updated.statutExecution}`);
};
