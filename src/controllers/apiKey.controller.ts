import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/database';
import { sendError, sendSuccess } from '../utils/response';
import { generateApiKey, OWNER_SCOPE } from '../services/apiKey.service';

const MAX_ACTIVE_KEYS = 10;

const publicKeyFields = {
  id: true,
  nom: true,
  prefix: true,
  scopes: true,
  estActive: true,
  dateCreation: true,
  derniereUtilisation: true,
  dateExpiration: true,
} as const;

export const apiKeyController = {
  /** Liste les clés du compte, sans jamais révéler le secret. */
  list: async (req: AuthRequest, res: Response) => {
    try {
      const keys = await prisma.cleApi.findMany({
        where: { utilisateurId: req.user!.id },
        orderBy: { dateCreation: 'desc' },
        select: publicKeyFields,
      });
      return sendSuccess(res, 'Clés API récupérées', keys);
    } catch {
      return sendError(res, 'Impossible de récupérer les clés API', 400);
    }
  },

  /** Crée une clé en lecture seule. Le secret n'est affiché qu'une fois. */
  create: async (req: AuthRequest, res: Response) => {
    try {
      const nom = String(req.body?.nom ?? '').trim();
      if (nom.length < 2 || nom.length > 60) {
        return sendError(res, 'Nom de clé requis (2 à 60 caractères)', 400);
      }

      const activeCount = await prisma.cleApi.count({
        where: { utilisateurId: req.user!.id, estActive: true },
      });
      if (activeCount >= MAX_ACTIVE_KEYS) {
        return sendError(
          res,
          `Limite de ${MAX_ACTIVE_KEYS} clés actives atteinte. Révoquez une ancienne clé.`,
          409
        );
      }

      const generated = generateApiKey();
      const created = await prisma.cleApi.create({
        data: {
          utilisateurId: req.user!.id,
          nom,
          prefix: generated.prefix,
          hash: generated.hash,
          scopes: [OWNER_SCOPE],
        },
        select: publicKeyFields,
      });

      return sendSuccess(
        res,
        'Clé API créée. Copiez-la maintenant : elle ne sera plus affichée.',
        { ...created, key: generated.plain },
        201
      );
    } catch {
      return sendError(res, 'Impossible de créer la clé API', 400);
    }
  },

  /** Révoque immédiatement une clé (les intégrations en cours reçoivent 401). */
  revoke: async (req: AuthRequest, res: Response) => {
    try {
      const id = String(req.params.id ?? '');
      if (!id) return sendError(res, 'ID de clé requis', 400);

      const key = await prisma.cleApi.findFirst({
        where: { id, utilisateurId: req.user!.id },
        select: { id: true },
      });
      if (!key) return sendError(res, 'Clé API introuvable', 404);

      await prisma.cleApi.update({
        where: { id: key.id },
        data: { estActive: false },
      });
      return sendSuccess(res, 'Clé API révoquée');
    } catch {
      return sendError(res, 'Impossible de révoquer la clé API', 400);
    }
  },
};
