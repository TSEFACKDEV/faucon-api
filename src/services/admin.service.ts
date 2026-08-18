import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AppError, NotFoundError } from '../utils/errors';
import { Role } from '../generated/prisma/enums';
import { vehicleService } from './vehicle.service';
import { EN_LIGNE_SEUIL_MS } from '../utils/constants';
import { dayBounds, jourAujourdhui, jourDecale } from '../utils/dayBounds';

const jourMoins = (offsetJours: number): string => jourDecale(-offsetJours);

export const adminService = {
  // ── Utilisateurs ───────────────────────────────────────────────
  getUtilisateurs: async () => {
    const utilisateurs = await prisma.utilisateur.findMany({
      include: { _count: { select: { vehicules: true } } },
      orderBy: { dateCreation: 'desc' },
    });
    return utilisateurs.map(({ _count, motDePasseHash: _, ...u }) => ({
      ...u,
      nbVehicules: _count.vehicules,
    }));
  },

  getUtilisateurById: async (id: string) => {
    const utilisateur = await prisma.utilisateur.findUnique({
      where: { id },
      select: {
        id: true, userName: true, email: true, telephone: true, role: true,
        dateCreation: true, derniereConnexion: true,
        vehicules: { select: { id: true, trackerId: true, imei: true, nom: true } },
      },
    });
    if (!utilisateur) throw new NotFoundError('Utilisateur introuvable');
    return utilisateur;
  },

  creerUtilisateur: async (userName: string, email: string, password: string, role: Role) => {
    const existingEmail = await prisma.utilisateur.findUnique({ where: { email } });
    if (existingEmail) throw new AppError('Cet email est déjà utilisé', 409);
    const existingUser = await prisma.utilisateur.findUnique({ where: { userName } });
    if (existingUser) throw new AppError('Ce nom d\'utilisateur est déjà pris', 409);

    const motDePasseHash = await bcrypt.hash(password, 12);
    return prisma.utilisateur.create({
      data: { userName, email, motDePasseHash, role },
      select: {
        id: true, userName: true, email: true, telephone: true, role: true,
        dateCreation: true, derniereConnexion: true,
      },
    });
  },

  setRole: async (id: string, role: Role) => {
    const utilisateur = await prisma.utilisateur.findUnique({ where: { id } });
    if (!utilisateur) throw new NotFoundError('Utilisateur introuvable');
    return prisma.utilisateur.update({
      where: { id },
      data: { role },
      select: { id: true, role: true },
    });
  },

  supprimerUtilisateur: async (id: string) => {
    const utilisateur = await prisma.utilisateur.findUnique({ where: { id } });
    if (!utilisateur) throw new NotFoundError('Utilisateur introuvable');
    await prisma.utilisateur.delete({ where: { id } });
  },

  // ── Traceurs (vue globale) ─────────────────────────────────────
  getVehicules: async () => {
    const vehicules = await prisma.vehicule.findMany({
      include: {
        utilisateur: { select: { id: true, userName: true, email: true } },
      },
      orderBy: { dateAjout: 'desc' },
    });

    // Dernière position de chaque traceur, en une seule requête (distinct
    // sur vehiculeId, tri horodatage desc → la plus récente par traceur).
    const dernieres = await prisma.position.findMany({
      where: { vehiculeId: { in: vehicules.map((v) => v.id) } },
      orderBy: { horodatage: 'desc' },
      distinct: ['vehiculeId'],
      select: { vehiculeId: true, latitude: true, longitude: true },
    });
    const positionParVehicule = new Map(dernieres.map((p) => [p.vehiculeId, p]));

    // Nombre de jours actifs par traceur — calcul côté serveur à partir des
    // positions (données immuables, non altérable par le client).
    const vehiculeIds = vehicules.map(v => v.id);
    const joursRows = vehiculeIds.length > 0
      ? await prisma.$queryRaw<{ vehiculeId: string; count: bigint }[]>`
          SELECT vehiculeId, COUNT(DISTINCT DATE(horodatage)) as count
          FROM positions
          WHERE vehiculeId = ANY(${vehiculeIds})
          GROUP BY vehiculeId
        `
      : [];
    const joursMap = new Map(joursRows.map(r => [r.vehiculeId, Number(r.count)]));

    const maintenant = Date.now();
    return vehicules.map((v) => {
      const pos = positionParVehicule.get(v.id);
      return {
        id: v.id,
        imei: v.imei,
        trackerId: v.trackerId,
        nom: v.nom,
        modeActuel: v.modeActuel,
        niveauBatterie: v.niveauBatterie,
        estActif: v.estActif,
        dateAjout: v.dateAjout,
        joursActifs: joursMap.get(v.id) ?? 0,
        derniereCommunication: v.derniereCommunication,
        latitude: pos?.latitude ?? null,
        longitude: pos?.longitude ?? null,
        enLigne: !!v.derniereCommunication && maintenant - v.derniereCommunication.getTime() < EN_LIGNE_SEUIL_MS,
        utilisateur: v.utilisateur,
      };
    });
  },

  getVehiculeById: async (id: string) => {
    const vehicule = await prisma.vehicule.findUnique({
      where: { id },
      include: {
        utilisateur: { select: { id: true, userName: true, email: true, telephone: true } },
        limiteVitesse: true,
        perimetreGeofence: true,
        alarmes: { orderBy: { horodatage: 'desc' }, take: 50 },
        commandes: { orderBy: { dateEnvoi: 'desc' }, take: 20 },
        positions: { orderBy: { horodatage: 'desc' }, take: 100 },
      },
    });
    if (!vehicule) throw new NotFoundError('Traceur introuvable');
    return vehicule;
  },

  updateVehicule: async (id: string, changes: { nom?: string; estActif?: boolean; utilisateurId?: string | null }) => {
    const vehicule = await prisma.vehicule.findUnique({ where: { id } });
    if (!vehicule) throw new NotFoundError('Traceur introuvable');

    if (changes.utilisateurId !== undefined && changes.utilisateurId !== null) {
      const utilisateur = await prisma.utilisateur.findUnique({ where: { id: changes.utilisateurId } });
      if (!utilisateur) throw new AppError('Utilisateur introuvable', 404);
    }

    const { utilisateurId, ...data } = changes;
    return prisma.vehicule.update({
      where: { id },
      data: {
        ...data,
        ...(utilisateurId === null ? { utilisateurId: null } : {}),
        ...(utilisateurId ? { utilisateurId } : {}),
      },
      select: { id: true, nom: true, estActif: true, utilisateurId: true },
    });
  },

  supprimerVehicule: async (id: string) => {
    const vehicule = await prisma.vehicule.findUnique({ where: { id } });
    if (!vehicule) throw new NotFoundError('Traceur introuvable');
    await prisma.vehicule.delete({ where: { id } });
  },

  sendCommande: async (vehiculeId: string, codeCommande: string, valeur?: string) => {
    return vehicleService.sendCommande(
      vehiculeId,
      undefined,
      codeCommande as never,
      valeur !== undefined ? { valeur } : undefined
    );
  },

  // ── Configuration (déclenchée par le dashboard admin) ─────────
  // Toutes les fonctions ci-dessous délèguent à vehicle.service, sans
  // propriétaire (undefined) : la restriction d'appartenance ne s'applique
  // qu'à l'app mobile, le rôle ADMIN étant déjà validé par le middleware.
  setMode: async (vehiculeId: string, mode: 'WORK' | 'MOVE' | 'STANDBY') =>
    vehicleService.setMode(vehiculeId, undefined, mode),

  setSpeedLimit: async (vehiculeId: string, seuilKmh: number) =>
    vehicleService.setSpeedLimit(vehiculeId, undefined, seuilKmh),

  setGeofence: async (vehiculeId: string, nom: string, centreLat: number, centreLon: number, rayonMetres: number) =>
    vehicleService.setGeofence(vehiculeId, undefined, nom, centreLat, centreLon, rayonMetres),

  setPhoneAlerte: async (vehiculeId: string, telephone: string) =>
    vehicleService.setPhoneAlerte(vehiculeId, undefined, telephone),

  // ── Alarmes ────────────────────────────────────────────────────
  getAlarmes: async (filtres?: { typeAlarme?: string; estAcquittee?: boolean; vehiculeId?: string }) => {
    return prisma.alarme.findMany({
      where: {
        ...(filtres?.typeAlarme ? { typeAlarme: filtres.typeAlarme as never } : {}),
        ...(filtres?.estAcquittee !== undefined ? { estAcquittee: filtres.estAcquittee } : {}),
        ...(filtres?.vehiculeId ? { vehiculeId: filtres.vehiculeId } : {}),
      },
      include: {
        vehicule: {
          select: {
            id: true, nom: true, trackerId: true,
            utilisateur: { select: { userName: true } },
          },
        },
      },
      orderBy: { horodatage: 'desc' },
      take: 200,
    });
  },

  acquitAlarme: async (alarmeId: string) =>
    vehicleService.acquitAlarme(alarmeId),

  deleteAlarme: async (alarmeId: string) =>
    vehicleService.deleteAlarme(alarmeId),

  // ── Statistiques du tableau de bord ────────────────────────────
  getStatsOverview: async () => {
    const maintenant = Date.now();
    const enLigneCutoff = new Date(maintenant - EN_LIGNE_SEUIL_MS);
    const aujourdhui = jourAujourdhui();
    const { start: debutAujourdhui, end: finAujourdhui } = dayBounds(aujourdhui);

    const [
      totalUtilisateurs,
      totalVehicules,
      vehiculesEnLigne,
      vehiculesActifs,
      alarmesNonAcquittees,
      alarmesAujourdhui,
      alarmesParType,
      repartitionModes,
    ] = await Promise.all([
      prisma.utilisateur.count(),
      prisma.vehicule.count(),
      prisma.vehicule.count({ where: { derniereCommunication: { gte: enLigneCutoff } } }),
      prisma.vehicule.count({ where: { estActif: true } }),
      prisma.alarme.count({ where: { estAcquittee: false } }),
      prisma.alarme.count({ where: { horodatage: { gte: debutAujourdhui, lte: finAujourdhui } } }),
      prisma.alarme.groupBy({ by: ['typeAlarme'], _count: { _all: true } }),
      prisma.vehicule.groupBy({ by: ['modeActuel'], _count: { _all: true } }),
    ]);

    // Les 30 + 7 requêtes de chaque série sont indépendantes (une date
    // distincte chacune) — les lancer en parallèle plutôt que d'attendre
    // (`await` dans une boucle `for`) chacune séquentiellement, sur un
    // endpoint appelé à chaque chargement du dashboard admin.
    const jours30 = Array.from({ length: 30 }, (_, k) => jourMoins(29 - k));
    const croissanceUtilisateurs30j = await Promise.all(
      jours30.map(async (date) => {
        const { end } = dayBounds(date);
        const total = await prisma.utilisateur.count({ where: { dateCreation: { lte: end } } });
        return { date, total };
      })
    );

    const jours7 = Array.from({ length: 7 }, (_, k) => jourMoins(6 - k));
    const alarmesParJour7j = await Promise.all(
      jours7.map(async (date) => {
        const { start, end } = dayBounds(date);
        const total = await prisma.alarme.count({ where: { horodatage: { gte: start, lte: end } } });
        return { date, total };
      })
    );

    const [batterieBasse, batterieMoyenne, batterieCorrecte, batterieBonne] = await Promise.all([
      prisma.vehicule.count({ where: { niveauBatterie: { lte: 20 } } }),
      prisma.vehicule.count({ where: { niveauBatterie: { gt: 20, lte: 50 } } }),
      prisma.vehicule.count({ where: { niveauBatterie: { gt: 50, lte: 80 } } }),
      prisma.vehicule.count({ where: { niveauBatterie: { gt: 80 } } }),
    ]);

    return {
      totalUtilisateurs,
      totalVehicules,
      vehiculesEnLigne,
      vehiculesActifs,
      alarmesNonAcquittees,
      alarmesAujourdhui,
      croissanceUtilisateurs30j,
      alarmesParJour7j,
      alarmesParType: alarmesParType.map((a) => ({ type: a.typeAlarme, total: a._count._all })),
      repartitionModes: repartitionModes.map((m) => ({ mode: m.modeActuel, total: m._count._all })),
      repartitionBatterie: [
        { tranche: '0-20', total: batterieBasse },
        { tranche: '21-50', total: batterieMoyenne },
        { tranche: '51-80', total: batterieCorrecte },
        { tranche: '81-100', total: batterieBonne },
      ],
    };
  },
};
