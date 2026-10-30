import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/database';
import { corsOrigins } from '../config/cors';
import { API_KEY_PREFIX, resolveApiKey } from '../services/apiKey.service';

interface AuthenticatedSocket extends Socket {
  data: { utilisateurId: string; role?: string; scope?: 'internal' | 'owner' };
}

let io: SocketServer;

export const initWebSocket = (httpServer: HttpServer): void => {
  io = new SocketServer(httpServer, {
    cors: { origin: corsOrigins, methods: ['GET', 'POST'], credentials: true },
  });

  // Authentification obligatoire à la connexion (le client passe déjà le
  // token dans `auth.token` — cf. client web et mobile — il manquait
  // seulement la vérification côté serveur).
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') {
      return next(new Error('Authentification requise'));
    }

    try {
      // Une clé API propriétaire peut ouvrir le canal temps réel, en lecture
      // seule, sans donner accès aux routes internes.
      if (token.startsWith(API_KEY_PREFIX)) {
        const utilisateurId = await resolveApiKey(token);
        if (!utilisateurId) return next(new Error('Clé API invalide'));
        (socket as AuthenticatedSocket).data.utilisateurId = utilisateurId;
        (socket as AuthenticatedSocket).data.role = 'UTILISATEUR';
        (socket as AuthenticatedSocket).data.scope = 'owner';
        next();
        return;
      }

      const payload = verifyAccessToken(token);
      (socket as AuthenticatedSocket).data.utilisateurId = payload.id;
      (socket as AuthenticatedSocket).data.role = payload.role;
      (socket as AuthenticatedSocket).data.scope = 'internal';
      next();
    } catch {
      next(new Error('Token invalide ou expiré'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const utilisateurId = (socket as AuthenticatedSocket).data.utilisateurId;
    console.log(`[WS] Client connecté : ${socket.id} (user ${utilisateurId})`);

    // Un client ne peut s'abonner qu'aux véhicules qu'il possède — sauf un
    // ADMIN (dashboard web de supervision), qui voit tous les traceurs.
    socket.on('subscribe', async (vehiculeIds: string[]) => {
      if (!Array.isArray(vehiculeIds) || vehiculeIds.length === 0) return;

      // Limite stricte : un client ne peut pas s'abonner à plus de 50
      // véhicules en une seule requête. Au-delà, c'est probablement une
      // erreur côté client ou une tentative de surcharge du serveur.
      const MAX_SUBSCRIBE = 50;
      const ids = vehiculeIds.slice(0, MAX_SUBSCRIBE);

      const isAdmin = (socket as AuthenticatedSocket).data.role === 'ADMIN';
      const isOwnerScope =
        (socket as AuthenticatedSocket).data.scope === 'owner';
      const owned = isAdmin
        ? await prisma.vehicule.findMany({ where: { id: { in: ids } }, select: { id: true } })
        : await prisma.vehicule.findMany({
            where: { id: { in: ids }, utilisateurId },
            select: { id: true },
          });

      // Un client authentifié par clé API n'entre jamais dans la room
      // interne : il ne peut donc pas recevoir les diagnostics complets,
      // les commandes ni les données d'exploitation.
      owned.forEach(({ id }) =>
        socket.join(isOwnerScope ? `owner-vehicle:${id}` : `vehicle:${id}`)
      );
      console.log(`[WS] ${socket.id} abonné à ${owned.length}/${vehiculeIds.length} véhicule(s)`);
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Client déconnecté : ${socket.id}`);
    });
  });
};

export const broadcastPosition = (vehiculeId: string, data: object): void => {
  if (!io) return;
  io.to(`vehicle:${vehiculeId}`)
    .to(`owner-vehicle:${vehiculeId}`)
    .emit('position_update', data);
};

export const broadcastAlarm = (vehiculeId: string, data: object): void => {
  if (!io) return;
  io.to(`vehicle:${vehiculeId}`)
    .to(`owner-vehicle:${vehiculeId}`)
    .emit('alarm', data);
};

// Notifie l'app mobile qu'une commande descendante (LOCALISER, MODE,
// REDEMARRER, RESET_USINE...) vient de changer de statut — envoyée,
// exécutée par le traceur, ou expirée.
export const broadcastCommandUpdate = (vehiculeId: string, data: object): void => {
  if (!io) return;
  io.to(`vehicle:${vehiculeId}`).emit('commande_update', data);
};

// Notifie l'app mobile du mode RÉELLEMENT appliqué par le traceur (confirmé
// par l'ACK d'une commande MODE ou MODE?). Émis uniquement quand le mode
// change — l'app n'a pas à le deviner ni à le redemander.
export const broadcastVehicleMode = (vehiculeId: string, modeActuel: string): void => {
  if (!io) return;
  // Le mode est un état public du véhicule : utile aux propriétaires.
  io.to(`vehicle:${vehiculeId}`)
    .to(`owner-vehicle:${vehiculeId}`)
    .emit('vehicle_mode', { vehiculeId, modeActuel });
};

// Notifie l'app mobile du dernier diagnostic reçu du traceur (canal
// faucon/<trackerId>/diag, toutes les 5 minutes) : modèle, version du
// firmware, compteurs de reset, santé I2C, file d'attente du journal
// flash, mémoire libre. Permet d'afficher l'état réel du boîtier sans
// interroger le traceur.
export const broadcastDiagnostic = (vehiculeId: string, data: object): void => {
  if (!io) return;
  io.to(`vehicle:${vehiculeId}`).emit('diagnostic_update', data);
};