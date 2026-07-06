
import { prisma } from '../config/database';
import { TrameHeartbeat } from '../types/tracker.types';

export const handleHeartbeat = async (
  trame: TrameHeartbeat,
  vehiculeId: string
): Promise<void> => {
  await prisma.vehicule.update({
    where: { id: vehiculeId },
    data: {
      niveauBatterie:        trame.battery,
      modeActuel:            trame.mode,
      derniereCommunication: new Date(trame.ts),
    },
  });

  console.log(`[HEARTBEAT] ${trame.imei} — bat:${trame.battery}% mode:${trame.mode} rssi:${trame.rssi}dBm`);
};