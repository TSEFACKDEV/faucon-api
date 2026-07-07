import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../types';

export const authController = {

  register: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userName, email, password } = req.body;

      if (!userName || !email || !password) {
        return sendError(res, 'Tous les champs sont requis', 400);
      }

      const result = await authService.register(userName, email, password);
      return sendSuccess(res, 'Inscription réussie', result, 201);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  },

  login: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return sendError(res, 'Email et mot de passe requis', 400);
      }

      const result = await authService.login(email, password);
      return sendSuccess(res, 'Connexion réussie', result);
    } catch (err: any) {
      return sendError(res, err.message, 401);
    }
  },

  me: async (req: AuthRequest, res: Response) => {
    try {
      const user = await authService.me(req.user!.id);
      return sendSuccess(res, 'Profil récupéré', user);
    } catch (err: any) {
      return sendError(res, err.message, 404);
    }
  },

  updateMe: async (req: AuthRequest, res: Response) => {
    try {
      const { userName, email, telephone } = req.body;
      const user = await authService.updateProfile(req.user!.id, { userName, email, telephone });
      return sendSuccess(res, 'Profil mis à jour', user);
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  },

  logout: async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) await authService.logout(refreshToken);
      return sendSuccess(res, 'Déconnexion réussie');
    } catch (err: any) {
      return sendError(res, err.message, 400);
    }
  },

  refresh: async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return sendError(res, 'Token requis', 400);

      const result = await authService.refresh(refreshToken);
      return sendSuccess(res, 'Token renouvelé', result);
    } catch (err: any) {
      return sendError(res, err.message, 401);
    }
  },
};