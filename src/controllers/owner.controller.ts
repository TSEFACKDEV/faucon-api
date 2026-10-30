import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/database';
import { sendError, sendSuccess } from '../utils/response';
import { EN_LIGNE_SEUIL_MS } from '../utils/constants';
import { dayBounds } from '../utils/dayBounds';

/**
 * API propriétaire — lecture seule.
 *
 * Périmètre volontairement minimal :
 *  - identité utile du traceur (id, nom, trackerId) ;
 *  - état : en ligne, batterie, mode, dernière communication ;
 *  - déplacements : dernière position et historique brut ;
 *  - alertes du véhicule ;
 *  - santé GPS/réseau/batterie du boîtier.
 *
 * Ne sont jamais exposés : compte, autres véhicules, identifiants MQTT,
 * téléphone d'alerte, commandes, configuration interne, compteurs de
 * diagnostic internes, ni aucune route d'administration.
 */

type SafePosition = {
  id: { toString(): string };
  latitude: number;
  longitude: number;
  altitude: number | null;
  vitesse: number;
  cap: number | null;
  nbSatellites: number | null;
  niveauSignal: number | null;
  hdop: number | null;
  niveauBatterie: number;
  statutACC: boolean;
  horodatage: Date;
  dateReception: Date;
};

function safePosition(position: SafePosition) {
  return {
    id: position.id.toString(),
    latitude: position.latitude,
    longitude: position.longitude,
    altitude: position.altitude,
    vitesse: position.vitesse,
    cap: position.cap,
    satellites: position.nbSatellites,
    signal: position.niveauSignal,
    hdop: position.hdop,
    batterie: position.niveauBatterie,
    contact: position.statutACC,
    horodatage: position.horodatage,
    recuLe: position.dateReception,
  };
}

function isOnline(derniereCommunication: Date | null): boolean {
  return (
    !!derniereCommunication &&
    Date.now() - derniereCommunication.getTime() < EN_LIGNE_SEUIL_MS
  );
}

const vehicleSelect = {
  id: true,
  nom: true,
  trackerId: true,
  modeActuel: true,
  niveauBatterie: true,
  estActif: true,
  derniereCommunication: true,
  limiteVitesse: { select: { seuilKmh: true, estActive: true } },
  perimetreGeofence: {
    select: {
      nom: true,
      centreLat: true,
      centreLon: true,
      rayonMetres: true,
      estActif: true,
    },
  },
} as const;

async function findOwnedVehicle(id: string, utilisateurId: string) {
  return prisma.vehicule.findFirst({
    where: { id, utilisateurId },
    select: vehicleSelect,
  });
}

export const ownerController = {
  listVehicles: async (req: AuthRequest, res: Response) => {
    try {
      const vehicles = await prisma.vehicule.findMany({
        where: { utilisateurId: req.user!.id },
        orderBy: { dateAjout: 'desc' },
        select: vehicleSelect,
      });

      const latest = await prisma.position.findMany({
        where: { vehiculeId: { in: vehicles.map((v) => v.id) } },
        orderBy: { horodatage: 'desc' },
        distinct: ['vehiculeId'],
        select: {
          vehiculeId: true,
          latitude: true,
          longitude: true,
          vitesse: true,
          cap: true,
          niveauBatterie: true,
          horodatage: true,
        },
      });
      const latestByVehicle = new Map(latest.map((p) => [p.vehiculeId, p]));

      const data = vehicles.map((vehicle) => {
        const position = latestByVehicle.get(vehicle.id);
        return {
          ...vehicle,
          enLigne: isOnline(vehicle.derniereCommunication),
          dernierePosition: position
            ? {
                latitude: position.latitude,
                longitude: position.longitude,
                vitesse: position.vitesse,
                cap: position.cap,
                batterie: position.niveauBatterie,
                horodatage: position.horodatage,
              }
            : null,
        };
      });

      return sendSuccess(res, 'Véhicules récupérés', data);
    } catch {
      return sendError(res, 'Impossible de récupérer les véhicules', 400);
    }
  },

  getVehicle: async (req: AuthRequest, res: Response) => {
    try {
      const vehicle = await findOwnedVehicle(
        String(req.params.id),
        req.user!.id
      );
      if (!vehicle) return sendError(res, 'Véhicule introuvable', 404);

      const position = await prisma.position.findFirst({
        where: { vehiculeId: vehicle.id },
        orderBy: { horodatage: 'desc' },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          altitude: true,
          vitesse: true,
          cap: true,
          nbSatellites: true,
          niveauSignal: true,
          hdop: true,
          niveauBatterie: true,
          statutACC: true,
          horodatage: true,
          dateReception: true,
        },
      });

      return sendSuccess(res, 'Véhicule récupéré', {
        ...vehicle,
        enLigne: isOnline(vehicle.derniereCommunication),
        dernierePosition: position ? safePosition(position) : null,
      });
    } catch {
      return sendError(res, 'Impossible de récupérer le véhicule', 400);
    }
  },

  lastPosition: async (req: AuthRequest, res: Response) => {
    try {
      const vehicle = await findOwnedVehicle(
        String(req.params.id),
        req.user!.id
      );
      if (!vehicle) return sendError(res, 'Véhicule introuvable', 404);

      const position = await prisma.position.findFirst({
        where: { vehiculeId: vehicle.id },
        orderBy: { horodatage: 'desc' },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          altitude: true,
          vitesse: true,
          cap: true,
          nbSatellites: true,
          niveauSignal: true,
          hdop: true,
          niveauBatterie: true,
          statutACC: true,
          horodatage: true,
          dateReception: true,
        },
      });

      return sendSuccess(
        res,
        position ? 'Dernière position' : 'Aucune position connue',
        position ? safePosition(position) : null
      );
    } catch {
      return sendError(res, 'Impossible de récupérer la position', 400);
    }
  },

  positions: async (req: AuthRequest, res: Response) => {
    try {
      const vehiculeId = String(req.params.id);
      const vehicle = await findOwnedVehicle(vehiculeId, req.user!.id);
      if (!vehicle) return sendError(res, 'Véhicule introuvable', 404);

      const from = req.query.from ? String(req.query.from) : undefined;
      const to = req.query.to ? String(req.query.to) : undefined;
      const date = req.query.date ? String(req.query.date) : undefined;

      let where: Record<string, unknown>;

      if (from || to) {
        const gte = from ? new Date(from) : undefined;
        const lte = to ? new Date(to) : undefined;
        if (
          (gte && Number.isNaN(gte.getTime())) ||
          (lte && Number.isNaN(lte.getTime()))
        ) {
          return sendError(res, 'Dates invalides (format ISO 8601 attendu)', 400);
        }
        where = {
          vehiculeId,
          ...(gte || lte
            ? { horodatage: { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) } }
            : {}),
        };
      } else {
        const targetDate = date ?? new Date().toISOString().slice(0, 10);
        if (Number.isNaN(new Date(targetDate).getTime())) {
          return sendError(res, 'Date invalide (format YYYY-MM-DD attendu)', 400);
        }
        const { start, end } = dayBounds(targetDate);
        where = { vehiculeId, horodatage: { gte: start, lte: end } };
      }

      const positions = await prisma.position.findMany({
        where,
        orderBy: { horodatage: 'asc' },
        take: 10_000,
        select: {
          id: true,
          latitude: true,
          longitude: true,
          altitude: true,
          vitesse: true,
          cap: true,
          nbSatellites: true,
          niveauSignal: true,
          hdop: true,
          niveauBatterie: true,
          statutACC: true,
          horodatage: true,
          dateReception: true,
        },
      });

      return sendSuccess(
        res,
        'Historique récupéré',
        positions.map((position) => safePosition(position))
      );
    } catch {
      return sendError(res, 'Impossible de récupérer l’historique', 400);
    }
  },

  alerts: async (req: AuthRequest, res: Response) => {
    try {
      const vehiculeId = String(req.params.id);
      const vehicle = await findOwnedVehicle(vehiculeId, req.user!.id);
      if (!vehicle) return sendError(res, 'Véhicule introuvable', 404);

      const requestedLimit = Number(req.query.limit ?? 50);
      const limit = Number.isFinite(requestedLimit)
        ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100)
        : 50;
      const unreadOnly = req.query.unread === 'true';

      const alerts = await prisma.alarme.findMany({
        where: {
          vehiculeId,
          ...(unreadOnly ? { estAcquittee: false } : {}),
        },
        orderBy: { horodatage: 'desc' },
        take: limit,
        select: {
          id: true,
          typeAlarme: true,
          latitude: true,
          longitude: true,
          valeurMesuree: true,
          seuilConfigure: true,
          estAcquittee: true,
          dateAcquittement: true,
          horodatage: true,
        },
      });

      return sendSuccess(res, 'Alertes récupérées', alerts);
    } catch {
      return sendError(res, 'Impossible de récupérer les alertes', 400);
    }
  },

  health: async (req: AuthRequest, res: Response) => {
    try {
      const vehiculeId = String(req.params.id);
      const vehicle = await findOwnedVehicle(vehiculeId, req.user!.id);
      if (!vehicle) return sendError(res, 'Véhicule introuvable', 404);

      const diagnostic = await prisma.diagnosticTraceur.findFirst({
        where: { vehiculeId },
        orderBy: { horodatage: 'desc' },
        // Sélection stricte : pas de compteurs de reset, mémoire, I2C,
        // firmware ni payload brut interne.
        select: {
          horodatage: true,
          mode: true,
          fixValide: true,
          fixPerime: true,
          ageFixSecondes: true,
          satellites: true,
          hdop: true,
          batteriePct: true,
          signalPct: true,
          signalValide: true,
        },
      });

      return sendSuccess(
        res,
        diagnostic ? 'État du traceur' : 'Aucun diagnostic disponible',
        diagnostic
      );
    } catch {
      return sendError(res, 'Impossible de récupérer l’état du traceur', 400);
    }
  },
};
