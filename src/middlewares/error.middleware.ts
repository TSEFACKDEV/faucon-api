import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error(`[ERROR] ${err.message}`);
  sendError(res, err.message ?? 'Erreur interne du serveur', 500);
};

export const notFound = (
  req: Request,
  res: Response
): void => {
  sendError(res, `Route ${req.originalUrl} introuvable`, 404);
};