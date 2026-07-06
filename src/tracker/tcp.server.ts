import net from 'net';
import {prisma }from '../config/database';
import { parseTrame } from './trame.parser';
import { validateTrame } from './trame.validator';
import { handlePosition } from './position.handler';

import { handleHeartbeat } from './heartbeat.handler';
import { TramePosition, TrameEvent, TrameHeartbeat } from '../types/tracker.types';
import { handleEvent } from './event.handler';

const TCP_PORT = Number(process.env.TCP_PORT ?? 5000);

// Map des connexions actives : imei → socket
const activeConnections = new Map<string, net.Socket>();

const getVehiculeId = async (imei: string): Promise<string | null> => {
  const vehicule = await prisma.vehicule.findUnique({
    where: { imei },
    select: { id: true },
  });
  return vehicule?.id ?? null;
};

const sendResponse = (socket: net.Socket, status: 'OK' | 'ERROR', message?: string): void => {
  const response = JSON.stringify({ status, message, ts: Date.now() }) + '\n';
  socket.write(response);
};

export const startTcpServer = (): net.Server => {
  const server = net.createServer((socket: net.Socket) => {
    const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[TCP] Nouvelle connexion : ${clientAddr}`);

    let buffer = '';
    let trackerImei: string | null = null;

    // Timeout : ferme la connexion si aucune donnée en 5 minutes
    socket.setTimeout(5 * 60 * 1000);

    socket.on('data', async (data: Buffer) => {
      buffer += data.toString('utf8');

      // Traitement ligne par ligne (délimiteur \n)
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Garde le fragment incomplet

      const trames = parseTrame(lines.join('\n'));

      for (const trame of trames) {
        // Validation
        const { valid, reason } = validateTrame(trame);
        if (!valid) {
          console.warn(`[TCP] Trame invalide depuis ${clientAddr} : ${reason}`);
          sendResponse(socket, 'ERROR', reason);
          continue;
        }

        // Vérifier que l'IMEI est enregistré en base
        const vehiculeId = await getVehiculeId(trame.imei);
        if (!vehiculeId) {
          console.warn(`[TCP] IMEI non enregistré : ${trame.imei}`);
          sendResponse(socket, 'ERROR', 'IMEI non enregistré');
          continue;
        }

        // Mémoriser l'IMEI de ce socket
        if (!trackerImei) {
          trackerImei = trame.imei;
          activeConnections.set(trame.imei, socket);
        }

        try {
          // Router selon le type de trame
          switch (trame.type) {
            case 'POSITION':
              await handlePosition(trame as TramePosition, vehiculeId);
              break;
            case 'EVENT':
              await handleEvent(trame as TrameEvent, vehiculeId);
              break;
            case 'HEARTBEAT':
              await handleHeartbeat(trame as TrameHeartbeat, vehiculeId);
              break;
          }

          sendResponse(socket, 'OK');
        } catch (err) {
          console.error(`[TCP] Erreur traitement trame :`, err);
          sendResponse(socket, 'ERROR', 'Erreur serveur');
        }
      }
    });

    socket.on('timeout', () => {
      console.log(`[TCP] Timeout connexion : ${clientAddr}`);
      socket.destroy();
    });

    socket.on('close', () => {
      console.log(`[TCP] Connexion fermée : ${clientAddr}`);
      if (trackerImei) activeConnections.delete(trackerImei);
    });

    socket.on('error', (err: Error) => {
      console.error(`[TCP] Erreur socket ${clientAddr} :`, err.message);
    });
  });

  server.listen(TCP_PORT, () => {
    console.log(`📡 TCP Listener démarré sur le port ${TCP_PORT}`);
  });

  server.on('error', (err: Error) => {
    console.error(`[TCP] Erreur serveur :`, err);
  });

  return server;
};

// Envoyer une commande à un traceur connecté
export const sendCommandToTracker = (imei: string, command: object): boolean => {
  const socket = activeConnections.get(imei);
  if (!socket || socket.destroyed) return false;

  const cmd = JSON.stringify(command) + '\n';
  socket.write(cmd);
  console.log(`[TCP] Commande envoyée à ${imei} :`, command);
  return true;
};