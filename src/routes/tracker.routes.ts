import { Router } from 'express';
import { sendError, sendSuccess } from '../utils/response';
import { prisma } from '../config/database';
import { handlePositionPayload } from '../tracker/position.handler';

const router = Router();

const parseNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseKeyValuePayload = (raw: string) => {
  const values: Record<string, string> = {};
  raw.split(/\r?\n|\s+/).forEach((segment) => {
    const [key, value] = segment.split('=');
    if (key && value) {
      values[key.trim()] = value.trim();
    }
  });
  return values;
};

const parseTimestamp = (value: number | null): Date => {
  if (value === null) return new Date();
  if (value < 1e9) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setSeconds(value);
    return date;
  }
  if (value < 1e10) {
    return new Date(value * 1000);
  }
  return new Date(value);
};

const mapTrackerEvent = (evt: unknown): string | undefined => {
  const eventCode = String(evt);
  if (eventCode === '1') return 'DECOLLEMENT_TRACEUR';
  if (eventCode === '2') return 'BATTERIE_FAIBLE';
  if (eventCode === '3') return 'VITESSE_EXCESSIVE';
  return undefined;
};

const parseSmsPosition = (raw: string) => {
  const values = parseKeyValuePayload(raw);
  if (!values.id || !values.lat || !values.lon || !values.bat) return null;

  return {
    deviceId: values.id,
    latitude: Number(values.lat),
    longitude: Number(values.lon),
    battery: Number(values.bat),
    event: values.evt,
    cycle: values.cyc ? Number(values.cyc) : undefined,
    alertCount: values.alr ? Number(values.alr) : undefined,
  };
};

router.post('/webhook', async (req, res) => {
  try {
    const id = req.query.id ?? req.query.trackerId ?? req.query.imei;
    const lat = parseNumber(req.query.lat);
    const lon = parseNumber(req.query.lon);
    const bat = parseNumber(req.query.bat);
    const speed = parseNumber(req.query.spd ?? req.query.speed);
    const cap = parseNumber(req.query.cap);
    const ts = parseNumber(req.query.ts);
    const evt = req.query.evt;
    const cyc = parseNumber(req.query.cyc);
    const alr = parseNumber(req.query.alr);

    if (!id || lat === null || lon === null || bat === null) {
      return sendError(res, 'Paramètres webhook incomplets', 400);
    }

    const device = await prisma.vehicule.findFirst({
      where: {
        OR: [
          { imei: String(id) },
          { trackerId: String(id) },
        ],
      },
      select: { id: true, imei: true, trackerId: true, nom: true },
    });

    if (!device) {
      return sendError(res, 'Device introuvable', 404);
    }

    await handlePositionPayload(device.id, {
      latitude: lat,
      longitude: lon,
      vitesse: speed ?? 0,
      cap: cap ?? 0,
      battery: bat,
      timestamp: parseTimestamp(ts),
      source: 'http',
      eventType: mapTrackerEvent(evt),
      cycleNumber: cyc ?? undefined,
      alertCount: alr ?? undefined,
    });

    return sendSuccess(res, 'Position reçue depuis le tracker', {
      deviceId: device.id,
      imei: device.imei,
      source: 'http',
    });
  } catch (error: any) {
    return sendError(res, error?.message ?? 'Erreur webhook', 500);
  }
});

router.post('/sms', async (req, res) => {
  try {
    const raw = typeof req.body?.text === 'string' ? req.body.text : '';
    if (!raw) return sendError(res, 'Texte SMS requis', 400);

    const parsed = parseSmsPosition(raw);
    if (!parsed) return sendError(res, 'Format SMS non reconnu', 400);

    const device = await prisma.vehicule.findFirst({
      where: {
        OR: [
          { imei: parsed.deviceId },
          { trackerId: parsed.deviceId },
        ],
      },
      select: { id: true, imei: true, trackerId: true, nom: true },
    });

    if (!device) {
      return sendError(res, 'Device introuvable', 404);
    }

    await handlePositionPayload(device.id, {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      vitesse: 0,
      cap: 0,
      battery: parsed.battery,
      timestamp: new Date(),
      source: 'sms',
      eventType: parsed.event ? mapTrackerEvent(parsed.event) : undefined,
      cycleNumber: parsed.cycle,
      alertCount: parsed.alertCount,
    });

    return sendSuccess(res, 'Position reçue depuis le SMS', {
      deviceId: device.id,
      imei: device.imei,
      source: 'sms',
    });
  } catch (error: any) {
    return sendError(res, error?.message ?? 'Erreur SMS', 500);
  }
});

export default router;
