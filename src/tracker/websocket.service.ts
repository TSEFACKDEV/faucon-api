import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { prisma } from '../config/database';
import { corsOrigins } from '../config/cors';

interface AuthenticatedSocket extends Socket {
  data: { utilisateurId: string };
}

let io: SocketServer;

export const initWebSocket = (httpServer: HttpServer): void => {
  io = new SocketServer(httpServer, {
    cors: { origin: corsOrigins, methods: ['GET', 'POST'], credentials: true },
  });

  // Authentification obligatoire à la connexion (le client passe déjà le
  // token dans `auth.token` — cf. client web et mobile — il manquait
  // seulement la vérification côté serveur).
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentification requise'));

    try {
      const payload = verifyAccessToken(token);
      (socket as AuthenticatedSocket).data.utilisateurId = payload.id;
      next();
    } catch {
      next(new Error('Token invalide ou expiré'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const utilisateurId = (socket as AuthenticatedSocket).data.utilisateurId;
    console.log(`[WS] Client connecté : ${socket.id} (user ${utilisateurId})`);

    // Un client ne peut s'abonner qu'aux véhicules qu'il possède.
    socket.on('subscribe', async (vehiculeIds: string[]) => {
      if (!Array.isArray(vehiculeIds) || vehiculeIds.length === 0) return;

      const owned = await prisma.vehicule.findMany({
        where: { id: { in: vehiculeIds }, utilisateurId },
        select: { id: true },
      });

      owned.forEach(({ id }) => socket.join(`vehicle:${id}`));
      console.log(`[WS] ${socket.id} abonné à ${owned.length}/${vehiculeIds.length} véhicule(s)`);
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Client déconnecté : ${socket.id}`);
    });
  });
};

export const broadcastPosition = (vehiculeId: string, data: object): void => {
  if (!io) return;
  io.to(`vehicle:${vehiculeId}`).emit('position_update', data);
};

export const broadcastAlarm = (vehiculeId: string, data: object): void => {
  if (!io) return;
  io.to(`vehicle:${vehiculeId}`).emit('alarm', data);
};