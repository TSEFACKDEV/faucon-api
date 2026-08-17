import bcrypt from 'bcryptjs';
import {prisma} from '../config/database';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { JwtPayload } from '../types';

export const authService = {

  register: async (userName: string, email: string, password: string) => {
    const existingEmail = await prisma.utilisateur.findUnique({ where: { email } });
    if (existingEmail) throw new Error('Cet email est déjà utilisé');

    const existingUser = await prisma.utilisateur.findUnique({ where: { userName } });
    if (existingUser) throw new Error('Ce nom d\'utilisateur est déjà pris');

    const motDePasseHash = await bcrypt.hash(password, 12);

    const user = await prisma.utilisateur.create({
      data: { userName, email, motDePasseHash },
      select: { id: true, userName: true, email: true, role: true, telephone: true, dateCreation: true },
    });

    const payload: JwtPayload = { id: user.id, email: user.email, userName: user.userName, role: user.role };
    const accessToken  = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    // Expiration refresh token dans 7 jours
    const dateExpiration = new Date();
    dateExpiration.setDate(dateExpiration.getDate() + 7);

    await prisma.refreshToken.create({
      data: { token: refreshToken, utilisateurId: user.id, dateExpiration },
    });

    return { user, tokens: { accessToken, refreshToken } };
  },

  login: async (email: string, password: string) => {
    const user = await prisma.utilisateur.findUnique({ where: { email } });
    if (!user) throw new Error('Email ou mot de passe incorrect');

    const isValid = await bcrypt.compare(password, user.motDePasseHash);
    if (!isValid) throw new Error('Email ou mot de passe incorrect');

    await prisma.utilisateur.update({
      where: { id: user.id },
      data: { derniereConnexion: new Date() },
    });

    const payload: JwtPayload = { id: user.id, email: user.email, userName: user.userName, role: user.role };
    const accessToken  = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    const dateExpiration = new Date();
    dateExpiration.setDate(dateExpiration.getDate() + 7);

    await prisma.refreshToken.create({
      data: { token: refreshToken, utilisateurId: user.id, dateExpiration },
    });

    const { motDePasseHash: _, ...safeUser } = user;
    return { user: safeUser, tokens: { accessToken, refreshToken } };
  },

  me: async (userId: string) => {
    const user = await prisma.utilisateur.findUnique({
      where: { id: userId },
      select: { id: true, userName: true, email: true, telephone: true, role: true, dateCreation: true },
    });
    if (!user) throw new Error('Utilisateur introuvable');
    return user;
  },

  updateProfile: async (
    userId: string,
    changes: { userName?: string; email?: string; telephone?: string }
  ) => {
    const { userName, email, telephone } = changes;

    if (userName) {
      const existing = await prisma.utilisateur.findUnique({ where: { userName } });
      if (existing && existing.id !== userId) throw new Error('Ce nom d\'utilisateur est déjà pris');
    }

    if (email) {
      const existing = await prisma.utilisateur.findUnique({ where: { email } });
      if (existing && existing.id !== userId) throw new Error('Cet email est déjà utilisé');
    }

    const user = await prisma.utilisateur.update({
      where: { id: userId },
      data: {
        ...(userName !== undefined && { userName }),
        ...(email !== undefined && { email }),
        ...(telephone !== undefined && { telephone }),
      },
      select: { id: true, userName: true, email: true, telephone: true, role: true, dateCreation: true },
    });

    return user;
  },

  logout: async (refreshToken: string) => {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  },

  refresh: async (refreshToken: string) => {
    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored) throw new Error('Token de rafraîchissement invalide');

    if (new Date() > stored.dateExpiration) {
      await prisma.refreshToken.delete({ where: { token: refreshToken } });
      throw new Error('Token de rafraîchissement expiré');
    }

    // Vérifie la signature/l'expiration JWT du token en plus de sa présence
    // en base — défense en profondeur, sans réutiliser ses claims (voir
    // pourquoi ci-dessous).
    verifyRefreshToken(refreshToken);

    // Relit l'utilisateur en base plutôt que de resigner un nouvel access
    // token à partir des claims figés dans l'ANCIEN refresh token : sinon
    // une rétrogradation de rôle (ADMIN -> UTILISATEUR) ou un changement
    // d'email/pseudo n'a aucun effet tant que l'utilisateur continue de
    // rafraîchir sa session — jusqu'à 7 jours après la rétrogradation.
    const user = await prisma.utilisateur.findUnique({ where: { id: stored.utilisateurId } });
    if (!user) {
      await prisma.refreshToken.delete({ where: { token: refreshToken } });
      throw new Error('Utilisateur introuvable');
    }

    const payload: JwtPayload = { id: user.id, email: user.email, userName: user.userName, role: user.role };
    const newAccessToken = signAccessToken(payload);

    // Rotation : chaque rafraîchissement invalide l'ancien refresh token et
    // en émet un nouveau (usage unique) plutôt que de laisser le même token
    // réutilisable pendant toute sa durée de vie (7 jours) — réduit la
    // fenêtre d'exploitation en cas de vol de token.
    const newRefreshToken = signRefreshToken(payload);
    const dateExpiration = new Date();
    dateExpiration.setDate(dateExpiration.getDate() + 7);

    try {
      await prisma.$transaction([
        prisma.refreshToken.delete({ where: { token: refreshToken } }),
        prisma.refreshToken.create({ data: { token: newRefreshToken, utilisateurId: user.id, dateExpiration } }),
      ]);
    } catch (err: any) {
      // Deux requêtes concurrentes avec le même refresh token (onglets
      // multiples, double 401 en rafale) peuvent toutes deux passer le
      // findUnique ci-dessus avant que la première ne supprime le token —
      // la seconde échoue alors ici (P2025, "record to delete does not
      // exist"). On traduit en message propre plutôt que de laisser fuiter
      // l'erreur Prisma brute au client.
      if (err?.code === 'P2025') {
        throw new Error('Token de rafraîchissement invalide ou déjà utilisé');
      }
      throw err;
    }

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  },
};