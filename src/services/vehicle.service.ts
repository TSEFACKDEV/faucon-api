import {prisma} from '../config/database';

export const vehicleService = {

  addVehicle: async (utilisateurId: string, imei: string, nom: string) => {
    const existing = await prisma.vehicule.findUnique({ where: { imei } });
    if (existing) throw new Error('Cet IMEI est déjà enregistré');

    return prisma.vehicule.create({
      data: { imei, nom, utilisateurId },
      select: {
        id: true, imei: true, nom: true,
        modeActuel: true, niveauBatterie: true, estActif: true, dateAjout: true,
      },
    });
  },

  getVehicles: async (utilisateurId: string) => {
    return prisma.vehicule.findMany({
      where: { utilisateurId },
      select: {
        id: true, imei: true, nom: true, image: true,
        modeActuel: true, niveauBatterie: true, estActif: true,
        derniereCommunication: true,
        limiteVitesse: true,
        perimetreGeofence: true,
      },
      orderBy: { dateAjout: 'desc' },
    });
  },

  getVehicleById: async (id: string, utilisateurId: string) => {
    const vehicle = await prisma.vehicule.findFirst({
      where: { id, utilisateurId },
      include: {
        limiteVitesse: true,
        perimetreGeofence: true,
        alarmes: {
          where: { estAcquittee: false },
          orderBy: { horodatage: 'desc' },
          take: 5,
        },
      },
    });
    if (!vehicle) throw new Error('Véhicule introuvable');
    return vehicle;
  },

  updateVehicle: async (id: string, utilisateurId: string, data: { nom?: string; image?: string }) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id, utilisateurId } });
    if (!vehicle) throw new Error('Véhicule introuvable');

    return prisma.vehicule.update({
      where: { id },
      data,
      select: { id: true, nom: true, image: true },
    });
  },

  deleteVehicle: async (id: string, utilisateurId: string) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id, utilisateurId } });
    if (!vehicle) throw new Error('Véhicule introuvable');
    await prisma.vehicule.delete({ where: { id } });
  },

  setSpeedLimit: async (vehiculeId: string, utilisateurId: string, seuilKmh: number) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new Error('Véhicule introuvable');

    return prisma.limiteVitesse.upsert({
      where: { vehiculeId },
      create: { vehiculeId, seuilKmh, estActive: true },
      update: { seuilKmh, estActive: true },
    });
  },

  setGeofence: async (
    vehiculeId: string,
    utilisateurId: string,
    nom: string,
    centreLat: number,
    centreLon: number,
    rayonMetres: number
  ) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new Error('Véhicule introuvable');

    return prisma.perimetreGeofence.upsert({
      where: { vehiculeId },
      create: { vehiculeId, nom, centreLat, centreLon, rayonMetres },
      update: { nom, centreLat, centreLon, rayonMetres, estActif: true },
    });
  },

  setMode: async (vehiculeId: string, utilisateurId: string, mode: 'WORK' | 'MOVE' | 'STANDBY') => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new Error('Véhicule introuvable');

    return prisma.vehicule.update({
      where: { id: vehiculeId },
      data: { modeActuel: mode },
      select: { id: true, modeActuel: true },
    });
  },

  getLastPosition: async (vehiculeId: string, utilisateurId: string) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new Error('Véhicule introuvable');

    return prisma.position.findFirst({
      where: { vehiculeId },
      orderBy: { horodatage: 'desc' },
    });
  },

  getPositionHistory: async (vehiculeId: string, utilisateurId: string, date: string) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new Error('Véhicule introuvable');

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return prisma.position.findMany({
      where: {
        vehiculeId,
        horodatage: { gte: start, lte: end },
      },
      orderBy: { horodatage: 'asc' },
      select: {
        id: true, latitude: true, longitude: true,
        vitesse: true, cap: true, horodatage: true,
      },
    });
  },

  getDailyReport: async (vehiculeId: string, utilisateurId: string, date: string) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new Error('Véhicule introuvable');

    return prisma.rapportJournalier.findFirst({
      where: { vehiculeId, date: new Date(date) },
    });
  },

  getAlarmes: async (vehiculeId: string, utilisateurId: string) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new Error('Véhicule introuvable');

    return prisma.alarme.findMany({
      where: { vehiculeId },
      orderBy: { horodatage: 'desc' },
      take: 50,
    });
  },

  acquitAlarme: async (alarmeId: string, utilisateurId: string) => {
    const alarme = await prisma.alarme.findFirst({
      where: { id: alarmeId, vehicule: { utilisateurId } },
    });
    if (!alarme) throw new Error('Alarme introuvable');

    return prisma.alarme.update({
      where: { id: alarmeId },
      data: { estAcquittee: true, dateAcquittement: new Date() },
    });
  },
};