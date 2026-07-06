import { Server as HttpServer } from 'http';
import { Server as SocketServer, Socket } from 'socket.io';

let io: SocketServer;

export const initWebSocket = (httpServer: HttpServer): void => {
  io = new SocketServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  io.on('connection', (socket: Socket) => {
    console.log(`[WS] Client connecté : ${socket.id}`);

    // Le client mobile s'abonne à ses véhicules
    socket.on('subscribe', (vehiculeIds: string[]) => {
      vehiculeIds.forEach(id => socket.join(`vehicle:${id}`));
      console.log(`[WS] ${socket.id} abonné à ${vehiculeIds.length} véhicule(s)`);
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