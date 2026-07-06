import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { verifyAccessToken } from '../utils/jwt';
import { sendError } from '../utils/response';

export const protect = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      sendError(res, 'Token manquant', 401);
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch {
    sendError(res, 'Token invalide ou expiré', 401);
  }
};