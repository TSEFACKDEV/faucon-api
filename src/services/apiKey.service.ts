import crypto from 'crypto';
import { prisma } from '../config/database';

export const API_KEY_PREFIX = 'fk_live_';
export const OWNER_SCOPE = 'owner:read';

export type GeneratedApiKey = {
  plain: string;
  prefix: string;
  hash: string;
};

/** Génère un secret affiché une seule fois au client. */
export function generateApiKey(): GeneratedApiKey {
  const secret = crypto.randomBytes(32).toString('base64url');
  const plain = `${API_KEY_PREFIX}${secret}`;
  return {
    plain,
    prefix: plain.slice(0, 16),
    hash: hashApiKey(plain),
  };
}

export function hashApiKey(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Extrait la clé d'un en-tête Authorization: Bearer fk_live_… ou X-API-Key. */
export function extractApiKey(headers: Record<string, unknown>): string | null {
  const direct = headers['x-api-key'];
  if (typeof direct === 'string' && direct.trim().length > 0) {
    return direct.trim();
  }

  const authorization = headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const value = authorization.slice(7).trim();
    if (value.startsWith(API_KEY_PREFIX)) return value;
  }
  return null;
}

/**
 * Vérifie une clé API et retourne l'utilisateur propriétaire, ou null.
 * La clé n'est jamais stockée en clair : on compare les empreintes SHA-256.
 */
export async function resolveApiKey(rawKey: string): Promise<string | null> {
  if (!rawKey.startsWith(API_KEY_PREFIX) || rawKey.length < 24) return null;

  const record = await prisma.cleApi.findUnique({
    where: { hash: hashApiKey(rawKey) },
    select: {
      id: true,
      utilisateurId: true,
      scopes: true,
      estActive: true,
    },
  });

  if (!record || !record.estActive) return null;
  // Les clés propriétaires sont permanentes : elles ne expirent pas avec le
  // temps, elles ne cessent de fonctionner que lorsqu'elles sont révoquées
  // explicitement depuis l'application. Évite les intégrations qui tombent
  // en panne sans raison visible.
  if (!record.scopes.includes(OWNER_SCOPE)) return null;

  // Trace d'usage (sans jamais journaliser la clé elle-même).
  await prisma.cleApi
    .update({
      where: { id: record.id },
      data: { derniereUtilisation: new Date() },
    })
    .catch(() => undefined);

  return record.utilisateurId;
}
