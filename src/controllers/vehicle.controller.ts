import { Response } from 'express';
import { AuthRequest } from '../types';
import { vehicleService } from '../services/vehicle.service';
import { sendSuccess, sendError } from '../utils/response';
import { prisma } from '../config/database';
import { generateVehicleReport } from '../cron/report.generator';

// Fonction utilitaire pour extraire un paramètre string
const getParamId = (param: string | string[] | undefined): string | null => {
  if (!param) return null;
  if (Array.isArray(param)) return param[0] || null;
  return param;
};

export const vehicleController = {

  addVehicle: async (req: AuthRequest, res: Response) => {
    try {
      const rawIdentifier = req.body.imei ?? req.body.deviceId ?? req.body.id ?? req.body.trackerId;
      const rawNom = req.body.nom ?? req.body.deviceName;
      const nom = rawNom ?? `Dispositif ${String(rawIdentifier ?? '').slice(-4)}`;
      const pin = req.body.pin ?? req.body.pinActivation;

      if (!rawIdentifier) return sendError(res, 'Identifiant du traceur requis', 400);
      const vehicle = await vehicleService.addVehicle(
        req.user!.id, String(rawIdentifier), String(nom), pin ? String(pin) : undefined
      );
      return sendSuccess(res, 'Appareil ajouté', vehicle, 201);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  getVehicles: async (req: AuthRequest, res: Response) => {
    try {
      const vehicles = await vehicleService.getVehicles(req.user!.id);
      return sendSuccess(res, 'Appareils récupérés', vehicles);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  getVehicleById: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);
      
      const vehicle = await vehicleService.getVehicleById(id, req.user!.id);
      return sendSuccess(res, 'Véhicule récupéré', vehicle);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 404);
    }
  },

  updateVehicle: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);
      
      const { nom, image } = req.body;
      const vehicle = await vehicleService.updateVehicle(id, req.user!.id, { nom, image });
      return sendSuccess(res, 'Véhicule mis à jour', vehicle);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  deleteVehicle: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);
      
      await vehicleService.deleteVehicle(id, req.user!.id);
      return sendSuccess(res, 'Véhicule supprimé');
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  setSpeedLimit: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);
      
      const { seuilKmh } = req.body;
      if (!seuilKmh) return sendError(res, 'Seuil requis', 400);
      const result = await vehicleService.setSpeedLimit(id, req.user!.id, Number(seuilKmh));
      return sendSuccess(res, 'Limite de vitesse configurée', result);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  setGeofence: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);
      
      const { nom, centreLat, centreLon, rayonMetres } = req.body;
      if (!nom || !centreLat || !centreLon || !rayonMetres) {
        return sendError(res, 'Tous les champs géofence sont requis', 400);
      }
      const result = await vehicleService.setGeofence(
        id, req.user!.id,
        nom, Number(centreLat), Number(centreLon), Number(rayonMetres)
      );
      return sendSuccess(res, 'Zone de sécurité configurée', result);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  setMode: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);
      
      const { mode } = req.body;
      if (!['WORK', 'MOVE', 'STANDBY'].includes(mode)) {
        return sendError(res, 'Mode invalide (WORK | MOVE | STANDBY)', 400);
      }
      const result = await vehicleService.setMode(id, req.user!.id, mode);
      return sendSuccess(res, 'Mode mis à jour', result);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  getLastPosition: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);
      
      const position = await vehicleService.getLastPosition(id, req.user!.id);
      return sendSuccess(res, 'Dernière position', position);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  getPositionHistory: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);

      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const date = req.query.date as string | undefined;

      const positions = from || to
        ? await vehicleService.getPositionHistoryRange(id, req.user!.id, from, to)
        : await vehicleService.getPositionHistory(id, req.user!.id, date ?? new Date().toISOString().split('T')[0]);

      return sendSuccess(res, 'Historique récupéré', positions);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  getReplay: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);

      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const positions = await vehicleService.getPositionHistoryRange(id, req.user!.id, from, to);
      return sendSuccess(res, 'Replay récupéré', positions);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  getDailyReport: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);
      
      const date = req.query.date as string ?? new Date().toISOString().split('T')[0];
      const report = await vehicleService.getDailyReport(id, req.user!.id, date);
      if (!report) {
        await generateVehicleReport(id, new Date(date));
        const regenerated = await vehicleService.getDailyReport(id, req.user!.id, date);
        return sendSuccess(res, 'Rapport journalier', regenerated);
      }
      return sendSuccess(res, 'Rapport journalier', report);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  getAlarmes: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);
      
      const alarmes = await vehicleService.getAlarmes(id, req.user!.id);
      return sendSuccess(res, 'Alarmes récupérées', alarmes);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  acquitAlarme: async (req: AuthRequest, res: Response) => {
    try {
      const alarmeId = getParamId(req.params.alarmeId ?? req.params.id);
      if (!alarmeId) return sendError(res, 'ID de l\'alarme requis', 400);
      
      const alarme = await vehicleService.acquitAlarme(alarmeId, req.user!.id);
      return sendSuccess(res, 'Alarme acquittée', alarme);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

generateReport: async (req: AuthRequest, res: Response) => {
    try {
      // 1. Correction de l'ID avec la fonction utilitaire
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);

      const { date } = req.body;
      const targetDate = date ? new Date(date) : new Date();

      // 2. Utilisation de l'ID validé pour la vérification
      const vehicle = await prisma.vehicule.findFirst({
        where: { id: id, utilisateurId: req.user!.id },
      });
      if (!vehicle) return sendError(res, 'Véhicule introuvable', 404);

      // 3. Utilisation de l'ID validé pour la génération
      await generateVehicleReport(id, targetDate);

      const report = await prisma.rapportJournalier.findFirst({
        where: {
          vehiculeId: id,
          date: new Date(targetDate.toISOString().split('T')[0]),
        },
      });

      return sendSuccess(res, 'Rapport généré', report);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },
};