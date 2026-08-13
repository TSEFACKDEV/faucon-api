"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const vehicle_service_1 = require("./vehicle.service");
const constants_1 = require("../utils/constants");
// Fuseau opérationnel (Africa/Douala, UTC+1, sans heure d'été). Tous les
// découpages "jour" (aujourd'hui, séries 7j/30j) utilisent ce fuseau pour
// rester alignés sur les CRON (scheduler.ts).
const TZ_OFFSET_MIN = 60;
const dayStartUtc = (isoDate) => {
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d) - TZ_OFFSET_MIN * 60000);
};
const dayBounds = (isoDate) => {
    const start = dayStartUtc(isoDate);
    return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1) };
};
const jourAujourdhui = () => new Date(Date.now() + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);
const jourMoins = (offsetJours) => {
    const shifted = new Date(Date.now() + TZ_OFFSET_MIN * 60000);
    shifted.setDate(shifted.getDate() - offsetJours);
    return shifted.toISOString().slice(0, 10);
};
exports.adminService = {
    // ── Utilisateurs ───────────────────────────────────────────────
    getUtilisateurs: async () => {
        const utilisateurs = await database_1.prisma.utilisateur.findMany({
            include: { _count: { select: { vehicules: true } } },
            orderBy: { dateCreation: 'desc' },
        });
        return utilisateurs.map(({ _count, motDePasseHash: _, ...u }) => ({
            ...u,
            nbVehicules: _count.vehicules,
        }));
    },
    getUtilisateurById: async (id) => {
        const utilisateur = await database_1.prisma.utilisateur.findUnique({
            where: { id },
            select: {
                id: true, userName: true, email: true, telephone: true, role: true,
                dateCreation: true, derniereConnexion: true,
                vehicules: { select: { id: true, trackerId: true, imei: true, nom: true } },
            },
        });
        if (!utilisateur)
            throw new errors_1.NotFoundError('Utilisateur introuvable');
        return utilisateur;
    },
    creerUtilisateur: async (userName, email, password, role) => {
        const existingEmail = await database_1.prisma.utilisateur.findUnique({ where: { email } });
        if (existingEmail)
            throw new errors_1.AppError('Cet email est déjà utilisé', 409);
        const existingUser = await database_1.prisma.utilisateur.findUnique({ where: { userName } });
        if (existingUser)
            throw new errors_1.AppError('Ce nom d\'utilisateur est déjà pris', 409);
        const motDePasseHash = await bcryptjs_1.default.hash(password, 12);
        return database_1.prisma.utilisateur.create({
            data: { userName, email, motDePasseHash, role },
            select: {
                id: true, userName: true, email: true, telephone: true, role: true,
                dateCreation: true, derniereConnexion: true,
            },
        });
    },
    setRole: async (id, role) => {
        const utilisateur = await database_1.prisma.utilisateur.findUnique({ where: { id } });
        if (!utilisateur)
            throw new errors_1.NotFoundError('Utilisateur introuvable');
        return database_1.prisma.utilisateur.update({
            where: { id },
            data: { role },
            select: { id: true, role: true },
        });
    },
    supprimerUtilisateur: async (id) => {
        const utilisateur = await database_1.prisma.utilisateur.findUnique({ where: { id } });
        if (!utilisateur)
            throw new errors_1.NotFoundError('Utilisateur introuvable');
        await database_1.prisma.utilisateur.delete({ where: { id } });
    },
    // ── Traceurs (vue globale) ─────────────────────────────────────
    getVehicules: async () => {
        const vehicules = await database_1.prisma.vehicule.findMany({
            include: {
                utilisateur: { select: { id: true, userName: true, email: true } },
            },
            orderBy: { dateAjout: 'desc' },
        });
        // Dernière position de chaque traceur, en une seule requête (distinct
        // sur vehiculeId, tri horodatage desc → la plus récente par traceur).
        const dernieres = await database_1.prisma.position.findMany({
            where: { vehiculeId: { in: vehicules.map((v) => v.id) } },
            orderBy: { horodatage: 'desc' },
            distinct: ['vehiculeId'],
            select: { vehiculeId: true, latitude: true, longitude: true },
        });
        const positionParVehicule = new Map(dernieres.map((p) => [p.vehiculeId, p]));
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
                derniereCommunication: v.derniereCommunication,
                latitude: pos?.latitude ?? null,
                longitude: pos?.longitude ?? null,
                enLigne: !!v.derniereCommunication && maintenant - v.derniereCommunication.getTime() < constants_1.EN_LIGNE_SEUIL_MS,
                utilisateur: v.utilisateur,
            };
        });
    },
    getVehiculeById: async (id) => {
        const vehicule = await database_1.prisma.vehicule.findUnique({
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
        if (!vehicule)
            throw new errors_1.NotFoundError('Traceur introuvable');
        return vehicule;
    },
    updateVehicule: async (id, changes) => {
        const vehicule = await database_1.prisma.vehicule.findUnique({ where: { id } });
        if (!vehicule)
            throw new errors_1.NotFoundError('Traceur introuvable');
        if (changes.utilisateurId !== undefined && changes.utilisateurId !== null) {
            const utilisateur = await database_1.prisma.utilisateur.findUnique({ where: { id: changes.utilisateurId } });
            if (!utilisateur)
                throw new errors_1.AppError('Utilisateur introuvable', 404);
        }
        const { utilisateurId, ...data } = changes;
        return database_1.prisma.vehicule.update({
            where: { id },
            data: {
                ...data,
                ...(utilisateurId === null ? { utilisateurId: null } : {}),
                ...(utilisateurId ? { utilisateurId } : {}),
            },
            select: { id: true, nom: true, estActif: true, utilisateurId: true },
        });
    },
    supprimerVehicule: async (id) => {
        const vehicule = await database_1.prisma.vehicule.findUnique({ where: { id } });
        if (!vehicule)
            throw new errors_1.NotFoundError('Traceur introuvable');
        await database_1.prisma.vehicule.delete({ where: { id } });
    },
    sendCommande: async (vehiculeId, codeCommande, valeur) => {
        return vehicle_service_1.vehicleService.sendCommande(vehiculeId, undefined, codeCommande, valeur !== undefined ? { valeur } : undefined);
    },
    // ── Configuration (déclenchée par le dashboard admin) ─────────
    // Toutes les fonctions ci-dessous délèguent à vehicle.service, sans
    // propriétaire (undefined) : la restriction d'appartenance ne s'applique
    // qu'à l'app mobile, le rôle ADMIN étant déjà validé par le middleware.
    setMode: async (vehiculeId, mode) => vehicle_service_1.vehicleService.setMode(vehiculeId, undefined, mode),
    setSpeedLimit: async (vehiculeId, seuilKmh) => vehicle_service_1.vehicleService.setSpeedLimit(vehiculeId, undefined, seuilKmh),
    setGeofence: async (vehiculeId, nom, centreLat, centreLon, rayonMetres) => vehicle_service_1.vehicleService.setGeofence(vehiculeId, undefined, nom, centreLat, centreLon, rayonMetres),
    setPhoneAlerte: async (vehiculeId, telephone) => vehicle_service_1.vehicleService.setPhoneAlerte(vehiculeId, undefined, telephone),
    // ── Alarmes ────────────────────────────────────────────────────
    getAlarmes: async (filtres) => {
        return database_1.prisma.alarme.findMany({
            where: {
                ...(filtres?.typeAlarme ? { typeAlarme: filtres.typeAlarme } : {}),
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
    acquitAlarme: async (alarmeId) => vehicle_service_1.vehicleService.acquitAlarme(alarmeId),
    deleteAlarme: async (alarmeId) => vehicle_service_1.vehicleService.deleteAlarme(alarmeId),
    // ── Statistiques du tableau de bord ────────────────────────────
    getStatsOverview: async () => {
        const maintenant = Date.now();
        const enLigneCutoff = new Date(maintenant - constants_1.EN_LIGNE_SEUIL_MS);
        const aujourdhui = jourAujourdhui();
        const { start: debutAujourdhui, end: finAujourdhui } = dayBounds(aujourdhui);
        const [totalUtilisateurs, totalVehicules, vehiculesEnLigne, vehiculesActifs, alarmesNonAcquittees, alarmesAujourdhui, alarmesParType, repartitionModes,] = await Promise.all([
            database_1.prisma.utilisateur.count(),
            database_1.prisma.vehicule.count(),
            database_1.prisma.vehicule.count({ where: { derniereCommunication: { gte: enLigneCutoff } } }),
            database_1.prisma.vehicule.count({ where: { estActif: true } }),
            database_1.prisma.alarme.count({ where: { estAcquittee: false } }),
            database_1.prisma.alarme.count({ where: { horodatage: { gte: debutAujourdhui, lte: finAujourdhui } } }),
            database_1.prisma.alarme.groupBy({ by: ['typeAlarme'], _count: { _all: true } }),
            database_1.prisma.vehicule.groupBy({ by: ['modeActuel'], _count: { _all: true } }),
        ]);
        const croissanceUtilisateurs30j = [];
        for (let i = 29; i >= 0; i--) {
            const date = jourMoins(i);
            const { end } = dayBounds(date);
            const total = await database_1.prisma.utilisateur.count({ where: { dateCreation: { lte: end } } });
            croissanceUtilisateurs30j.push({ date, total });
        }
        const alarmesParJour7j = [];
        for (let i = 6; i >= 0; i--) {
            const date = jourMoins(i);
            const { start, end } = dayBounds(date);
            const total = await database_1.prisma.alarme.count({ where: { horodatage: { gte: start, lte: end } } });
            alarmesParJour7j.push({ date, total });
        }
        const [batterieBasse, batterieMoyenne, batterieCorrecte, batterieBonne] = await Promise.all([
            database_1.prisma.vehicule.count({ where: { niveauBatterie: { lte: 20 } } }),
            database_1.prisma.vehicule.count({ where: { niveauBatterie: { gt: 20, lte: 50 } } }),
            database_1.prisma.vehicule.count({ where: { niveauBatterie: { gt: 50, lte: 80 } } }),
            database_1.prisma.vehicule.count({ where: { niveauBatterie: { gt: 80 } } }),
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
