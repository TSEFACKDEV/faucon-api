"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OWNER_SCOPE = exports.API_KEY_PREFIX = void 0;
exports.generateApiKey = generateApiKey;
exports.hashApiKey = hashApiKey;
exports.extractApiKey = extractApiKey;
exports.resolveApiKey = resolveApiKey;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
exports.API_KEY_PREFIX = 'fk_live_';
exports.OWNER_SCOPE = 'owner:read';
/** Génère un secret affiché une seule fois au client. */
function generateApiKey() {
    const secret = crypto_1.default.randomBytes(32).toString('base64url');
    const plain = `${exports.API_KEY_PREFIX}${secret}`;
    return {
        plain,
        prefix: plain.slice(0, 16),
        hash: hashApiKey(plain),
    };
}
function hashApiKey(value) {
    return crypto_1.default.createHash('sha256').update(value, 'utf8').digest('hex');
}
/** Extrait la clé d'un en-tête Authorization: Bearer fk_live_… ou X-API-Key. */
function extractApiKey(headers) {
    const direct = headers['x-api-key'];
    if (typeof direct === 'string' && direct.trim().length > 0) {
        return direct.trim();
    }
    const authorization = headers.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
        const value = authorization.slice(7).trim();
        if (value.startsWith(exports.API_KEY_PREFIX))
            return value;
    }
    return null;
}
/**
 * Vérifie une clé API et retourne l'utilisateur propriétaire, ou null.
 * La clé n'est jamais stockée en clair : on compare les empreintes SHA-256.
 */
async function resolveApiKey(rawKey) {
    if (!rawKey.startsWith(exports.API_KEY_PREFIX) || rawKey.length < 24)
        return null;
    const record = await database_1.prisma.cleApi.findUnique({
        where: { hash: hashApiKey(rawKey) },
        select: {
            id: true,
            utilisateurId: true,
            scopes: true,
            estActive: true,
            dateExpiration: true,
        },
    });
    if (!record || !record.estActive)
        return null;
    if (record.dateExpiration && record.dateExpiration.getTime() < Date.now()) {
        return null;
    }
    if (!record.scopes.includes(exports.OWNER_SCOPE))
        return null;
    // Trace d'usage (sans jamais journaliser la clé elle-même).
    await database_1.prisma.cleApi
        .update({
        where: { id: record.id },
        data: { derniereUtilisation: new Date() },
    })
        .catch(() => undefined);
    return record.utilisateurId;
}
