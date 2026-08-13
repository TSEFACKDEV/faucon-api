import { Request, Response } from 'express';
import { adminService } from '../services/admin.service';
import { provisionerLot } from '../services/provisioning.service';
import { sendSuccess, sendError } from '../utils/response';
import { Role } from '../generated/prisma/enums';
import { getParamId } from '../utils/params';

const ROLE_VALUES = ['UTILISATEUR', 'ADMIN'];
const CODES_COMMANDE = ['LOCALISER', 'MODE', 'REDEMARRER', 'RESET_USINE'];

export const adminController = {
  // ── Utilisateurs ──────────────────────────────────────────────
  getUtilisateurs: async (_req: Request, res: Response) => {
    try {
      const data = await adminService.getUtilisateurs();
      return sendSuccess(res, 'Utilisateurs récupérés', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  getUtilisateurById: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID utilisateur requis', 400);
      const data = await adminService.getUtilisateurById(id);
      return sendSuccess(res, 'Utilisateur récupéré', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 404);
    }
  },

  creerUtilisateur: async (req: Request, res: Response) => {
    try {
      const { userName, email, password, role } = req.body;
      if (!userName || !email || !password) {
        return sendError(res, 'Tous les champs sont requis', 400);
      }
      if (!ROLE_VALUES.includes(role)) {
        return sendError(res, 'Rôle invalide (UTILISATEUR | ADMIN)', 400);
      }
      if (typeof password !== 'string' || password.length < 8) {
        return sendError(res, 'Le mot de passe doit contenir au moins 8 caractères', 400);
      }
      const data = await adminService.creerUtilisateur(String(userName), String(email), password, role as Role);
      return sendSuccess(res, 'Utilisateur créé', data, 201);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  setRole: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      const { role } = req.body;
      if (!id) return sendError(res, 'ID utilisateur requis', 400);
      if (!ROLE_VALUES.includes(role)) {
        return sendError(res, 'Rôle invalide (UTILISATEUR | ADMIN)', 400);
      }
      const data = await adminService.setRole(id, role as Role);
      return sendSuccess(res, 'Rôle mis à jour', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  supprimerUtilisateur: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID utilisateur requis', 400);
      await adminService.supprimerUtilisateur(id);
      return sendSuccess(res, 'Utilisateur supprimé');
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  // ── Traceurs (vue globale) ─────────────────────────────────────
  getVehicules: async (_req: Request, res: Response) => {
    try {
      const data = await adminService.getVehicules();
      return sendSuccess(res, 'Traceurs récupérés', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  getVehiculeById: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID traceur requis', 400);
      const data = await adminService.getVehiculeById(id);
      return sendSuccess(res, 'Traceur récupéré', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 404);
    }
  },

  updateVehicule: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID traceur requis', 400);
      const { nom, estActif, utilisateurId } = req.body;
      const data = await adminService.updateVehicule(id, {
        ...(nom !== undefined ? { nom: String(nom) } : {}),
        ...(estActif !== undefined ? { estActif: Boolean(estActif) } : {}),
        ...(utilisateurId !== undefined ? { utilisateurId: utilisateurId === '' ? null : String(utilisateurId) } : {}),
      });
      return sendSuccess(res, 'Traceur mis à jour', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  supprimerVehicule: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID traceur requis', 400);
      await adminService.supprimerVehicule(id);
      return sendSuccess(res, 'Traceur supprimé');
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  sendCommande: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      if (!id) return sendError(res, 'ID traceur requis', 400);
      const { codeCommande, valeur } = req.body;
      if (!CODES_COMMANDE.includes(codeCommande)) {
        return sendError(res, `Commande invalide (${CODES_COMMANDE.join(' | ')})`, 400);
      }
      if (codeCommande === 'MODE' && !['WORK', 'MOVE', 'STANDBY'].includes(valeur)) {
        return sendError(res, 'Mode invalide (WORK | MOVE | STANDBY)', 400);
      }
      const data = await adminService.sendCommande(id, codeCommande, valeur !== undefined ? String(valeur) : undefined);
      return sendSuccess(res, 'Commande envoyée', data, 201);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  provisionVehicules: async (req: Request, res: Response) => {
    try {
      const count = Number(req.body.count ?? 0);
      const prefix = String(req.body.prefix ?? 'FCN');

      const lot = await provisionerLot(count, prefix);
      return sendSuccess(res, `${lot.length} traceur(s) provisionné(s)`, lot, 201);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  setMode: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      const { mode } = req.body;
      if (!id) return sendError(res, 'ID traceur requis', 400);
      if (!['WORK', 'MOVE', 'STANDBY'].includes(mode)) {
        return sendError(res, 'Mode invalide (WORK | MOVE | STANDBY)', 400);
      }
      const data = await adminService.setMode(id, mode);
      return sendSuccess(res, 'Mode mis à jour', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  setSpeedLimit: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      const { seuilKmh } = req.body;
      if (!id) return sendError(res, 'ID traceur requis', 400);
      if (!seuilKmh) return sendError(res, 'Seuil requis', 400);
      const data = await adminService.setSpeedLimit(id, Number(seuilKmh));
      return sendSuccess(res, 'Limite de vitesse configurée', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  setGeofence: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      const { nom, centreLat, centreLon, rayonMetres } = req.body;
      if (!id) return sendError(res, 'ID traceur requis', 400);
      if (!nom || !centreLat || !centreLon || !rayonMetres) {
        return sendError(res, 'Tous les champs géofence sont requis', 400);
      }
      const data = await adminService.setGeofence(
        id, String(nom), Number(centreLat), Number(centreLon), Number(rayonMetres)
      );
      return sendSuccess(res, 'Zone de sécurité configurée', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  setPhoneAlerte: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.id);
      const { telephone } = req.body;
      if (!id) return sendError(res, 'ID traceur requis', 400);
      if (!telephone || typeof telephone !== 'string') {
        return sendError(res, 'Numéro de téléphone requis', 400);
      }
      const data = await adminService.setPhoneAlerte(id, telephone.trim());
      return sendSuccess(res, 'Numéro SMS mis à jour', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  // ── Alarmes ────────────────────────────────────────────────────
  getAlarmes: async (req: Request, res: Response) => {
    try {
      const { typeAlarme, estAcquittee, vehiculeId } = req.query;
      const data = await adminService.getAlarmes({
        ...(typeof typeAlarme === 'string' ? { typeAlarme } : {}),
        ...(estAcquittee !== undefined ? { estAcquittee: estAcquittee === 'true' } : {}),
        ...(typeof vehiculeId === 'string' ? { vehiculeId } : {}),
      });
      return sendSuccess(res, 'Alarmes récupérées', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  acquitAlarme: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.alarmeId ?? req.params.id);
      if (!id) return sendError(res, 'ID alarme requis', 400);
      const data = await adminService.acquitAlarme(id);
      return sendSuccess(res, 'Alarme acquittée', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  deleteAlarme: async (req: Request, res: Response) => {
    try {
      const id = getParamId(req.params.alarmeId ?? req.params.id);
      if (!id) return sendError(res, 'ID alarme requis', 400);
      await adminService.deleteAlarme(id);
      return sendSuccess(res, 'Alarme supprimée');
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },

  // ── Statistiques ───────────────────────────────────────────────
  getStatsOverview: async (_req: Request, res: Response) => {
    try {
      const data = await adminService.getStatsOverview();
      return sendSuccess(res, 'Statistiques récupérées', data);
    } catch (err: any) {
      return sendError(res, err.message, err.statusCode ?? 400);
    }
  },
};
