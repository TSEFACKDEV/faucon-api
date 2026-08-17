import { Response } from 'express';
import { AuthRequest } from '../types';
import { vehicleService } from '../services/vehicle.service';
import { sendSuccess, sendError } from '../utils/response';
import { prisma } from '../config/database';
import { generateVehicleReport, toIsoDateDouala } from '../cron/report.generator';
import { getParamId } from '../utils/params';
import { isValidCoord } from '../tracker/trame.validator';

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
      
      // `!seuilKmh` rejetterait seulement les valeurs "falsy" (0, vide) mais
      // laisserait passer une valeur négative ("-5" est truthy) — un seuil
      // négatif rendrait toute vitesse mesurée "excessive" en continu.
      const seuilKmh = Number(req.body.seuilKmh);
      if (!Number.isFinite(seuilKmh) || seuilKmh <= 0 || seuilKmh > 300) {
        return sendError(res, 'Seuil de vitesse invalide (entre 0 et 300 km/h)', 400);
      }
      const result = await vehicleService.setSpeedLimit(id, req.user!.id, seuilKmh);
      return sendSuccess(res, 'Limite de vitesse configurée', result);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  setGeofence: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);
      
      // `!centreLat`/`!centreLon` rejetterait à tort une coordonnée à 0°
      // (l'équateur ou le méridien de Greenwich sont des latitudes/longitudes
      // valides, 0 est "falsy" en JS) ; `!rayonMetres` laisse passer un rayon
      // négatif ("-5" est truthy), qui ferait déclencher SORTIE_ZONE en boucle
      // dès la position suivante (distance > rayon négatif est ~toujours vrai).
      const { nom } = req.body;
      const centreLat = Number(req.body.centreLat);
      const centreLon = Number(req.body.centreLon);
      const rayonMetres = Number(req.body.rayonMetres);
      if (!nom || !isValidCoord(centreLat, centreLon)) {
        return sendError(res, 'Coordonnées du centre invalides', 400);
      }
      if (!Number.isFinite(rayonMetres) || rayonMetres <= 0) {
        return sendError(res, 'Rayon de la zone invalide', 400);
      }
      const result = await vehicleService.setGeofence(
        id, req.user!.id,
        nom, centreLat, centreLon, rayonMetres
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

  setPhoneAlerte: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);

      const { telephone } = req.body;
      if (!telephone || typeof telephone !== 'string') {
        return sendError(res, 'Numéro de téléphone requis', 400);
      }
      const result = await vehicleService.setPhoneAlerte(id, req.user!.id, telephone.trim());
      return sendSuccess(res, 'Numéro SMS mis à jour', result);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  sendCommande: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);

      const { codeCommande, valeur } = req.body;
      const codesValides = ['LOCALISER', 'MODE', 'REDEMARRER', 'RESET_USINE'];
      if (!codesValides.includes(codeCommande)) {
        return sendError(res, `Commande invalide (${codesValides.join(' | ')})`, 400);
      }
      if (codeCommande === 'MODE' && !['WORK', 'MOVE', 'STANDBY'].includes(valeur)) {
        return sendError(res, 'Mode invalide (WORK | MOVE | STANDBY)', 400);
      }

      const commande = await vehicleService.sendCommande(
        id, req.user!.id, codeCommande, valeur !== undefined ? { valeur } : undefined
      );
      return sendSuccess(res, 'Commande envoyée', commande, 201);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  getCommandes: async (req: AuthRequest, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID du véhicule requis', 400);

      const commandes = await vehicleService.getCommandes(id, req.user!.id);
      return sendSuccess(res, 'Commandes récupérées', commandes);
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
        : await vehicleService.getPositionHistory(id, req.user!.id, date ?? toIsoDateDouala(new Date()));

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
      
      const date = req.query.date as string ?? toIsoDateDouala(new Date());
      if (date > toIsoDateDouala(new Date())) {
        return sendError(res, 'Impossible de générer un rapport pour une date future', 400);
      }
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

  deleteAlarme: async (req: AuthRequest, res: Response) => {
    try {
      const alarmeId = getParamId(req.params.alarmeId ?? req.params.id);
      if (!alarmeId) return sendError(res, 'ID de l\'alarme requis', 400);

      await vehicleService.deleteAlarme(alarmeId, req.user!.id);
      return sendSuccess(res, 'Alarme supprimée');
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
      if (toIsoDateDouala(targetDate) > toIsoDateDouala(new Date())) {
        return sendError(res, 'Impossible de générer un rapport pour une date future', 400);
      }

      // 2. Utilisation de l'ID validé pour la vérification
      const vehicle = await prisma.vehicule.findFirst({
        where: { id: id, utilisateurId: req.user!.id },
      });
      if (!vehicle) return sendError(res, 'Véhicule introuvable', 404);

      // 3. Utilisation de l'ID validé pour la génération
      await generateVehicleReport(id, targetDate);

      // Même dérivation que generateVehicleReport (Douala, pas UTC) — sinon
      // on relit sous un jour calendaire différent de celui qui vient d'être
      // écrit et on retombe systématiquement sur `report === null`.
      const report = await prisma.rapportJournalier.findFirst({
        where: {
          vehiculeId: id,
          date: new Date(toIsoDateDouala(targetDate)),
        },
      });

      return sendSuccess(res, 'Rapport généré', report);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },
};