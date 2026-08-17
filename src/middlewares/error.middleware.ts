import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';
import { AppError } from '../utils/errors';

// N'atteint ce handler global que ce qui n'a pas été intercepté par un
// try/catch de contrôleur (ceux-ci gèrent déjà `err.statusCode` au cas par
// cas). Une `AppError` reste un message métier volontairement destiné à
// l'utilisateur (ex. "Véhicule introuvable") — on le renvoie tel quel. Toute
// autre exception est, par définition, non anticipée (bug, erreur Prisma
// brute, etc.) : son message peut contenir des détails internes (requêtes
// SQL, chemins de fichiers...) qui n'ont rien à faire côté client. On la
// journalise en entier côté serveur mais on ne renvoie qu'un message
// générique.
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error(`[ERROR] ${req.method} ${req.originalUrl} —`, err);

  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode);
    return;
  }

  sendError(res, 'Erreur interne du serveur', 500);
};

export const notFound = (
  req: Request,
  res: Response
): void => {
  sendError(res, `Route ${req.originalUrl} introuvable`, 404);
};