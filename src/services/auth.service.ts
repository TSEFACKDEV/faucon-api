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
      select: { id: true, userName: true, email: true, dateCreation: true },
    });

    const payload: JwtPayload = { id: user.id, email: user.email, userName: user.userName };
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

    const payload: JwtPayload = { id: user.id, email: user.email, userName: user.userName };
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
      select: { id: true, userName: true, email: true, telephone: true, dateCreation: true },
    });
    if (!user) throw new Error('Utilisateur introuvable');
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

    const decoded = verifyRefreshToken(refreshToken);
    const newAccessToken = signAccessToken({
      id: decoded.id,
      email: decoded.email,
      userName: decoded.userName,
    });

    return { accessToken: newAccessToken };
  },
};