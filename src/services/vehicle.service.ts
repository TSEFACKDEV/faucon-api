import {prisma} from '../config/database';
import { AppError, NotFoundError } from '../utils/errors';
import { findVehiculeByIdentifier } from './vehicle-lookup.service';
import { publishCommand } from '../tracker/mqtt.client';

export type CodeCommande = 'LOCALISER' | 'MODE' | 'REDEMARRER' | 'RESET_USINE' | 'NUMERO_SMS';

// Format international minimal (+237XXXXXXXXX) — le firmware refait de
// toute façon sa propre validation avant d'accepter la commande, celle-ci
// n'est là que pour rejeter les erreurs de saisie évidentes tout de suite.
const NUMERO_SMS_REGEX = /^\+[1-9]\d{7,14}$/;

// Crée la commande en base (PENDING) puis la publie sur le topic MQTT du
// traceur. Si la publication échoue immédiatement (canal MQTT indisponible
// — cf. `publishCommand` qui renvoie false quand le client n'est pas
// connecté), on marque tout de suite FAILED plutôt que de laisser la
// commande PENDING pour toujours : sans ça, seul le cron de nettoyage des
// commandes expirées la ferait disparaître, des dizaines de minutes plus
// tard.
const envoyerCommande = async (
  vehiculeId: string,
  trackerId: string,
  codeCommande: CodeCommande,
  parametres?: Record<string, unknown>
) => {
  const commande = await prisma.commandeDescendante.create({
    data: { vehiculeId, codeCommande, parametres: parametres as any, statutExecution: 'PENDING' },
  });

  const envoyee = publishCommand(trackerId, {
    id: commande.id,
    cmd: codeCommande,
    valeur: parametres?.valeur,
  });

  if (!envoyee) {
    return prisma.commandeDescendante.update({
      where: { id: commande.id },
      data: { statutExecution: 'FAILED', dateReponse: new Date() },
    });
  }
  return commande;
};

export const vehicleService = {

  addVehicle: async (utilisateurId: string, identifier: string, nom: string, pin?: string) => {
    const existing = await findVehiculeByIdentifier(identifier);

    if (!existing) {
      throw new NotFoundError('Traceur non enregistré. Veuillez vérifier l’identifiant du boîtier.');
    }

    if (existing.utilisateurId && existing.utilisateurId !== utilisateurId) {
      throw new AppError('Ce traceur est déjà connecté à un autre compte.', 409);
    }

    // Le PIN n'est exigé qu'au moment du premier rattachement (le traceur
    // n'a pas encore de propriétaire) — un traceur provisionné en série a
    // toujours un pinActivation ; les anciens traceurs de démo/seed n'en ont
    // pas et restent réclamables sans PIN.
    if (!existing.utilisateurId && existing.pinActivation) {
      if (!pin || pin.toUpperCase() !== existing.pinActivation) {
        throw new AppError('Code d’activation invalide. Vérifiez le PIN imprimé sur le boîtier.', 400);
      }
    }

    const updateData: any = {
      nom: nom ?? existing.nom,
      estActif: true,
    };

    if (!existing.utilisateurId) {
      updateData.utilisateurId = utilisateurId;
    }
    if (!existing.imei && /^[0-9]{15}$/.test(identifier)) {
      updateData.imei = identifier;
    }
    if (!existing.trackerId) {
      updateData.trackerId = identifier;
    }

    return prisma.vehicule.update({
      where: { id: existing.id },
      data: updateData,
      select: {
        id: true, imei: true, trackerId: true, nom: true,
        modeActuel: true, niveauBatterie: true, estActif: true, dateAjout: true,
      },
    });
  },

  getVehicles: async (utilisateurId: string) => {
    return prisma.vehicule.findMany({
      where: { utilisateurId },
      select: {
        id: true, imei: true, trackerId: true, nom: true, image: true,
        modeActuel: true, niveauBatterie: true, estActif: true,
        derniereCommunication: true, telephoneAlerte: true,
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
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');
    return vehicle;
  },

  updateVehicle: async (id: string, utilisateurId: string, data: { nom?: string; image?: string }) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id, utilisateurId } });
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');

    return prisma.vehicule.update({
      where: { id },
      data,
      select: { id: true, nom: true, image: true },
    });
  },

  deleteVehicle: async (id: string, utilisateurId: string) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id, utilisateurId } });
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');
    await prisma.vehicule.delete({ where: { id } });
  },

  setSpeedLimit: async (vehiculeId: string, utilisateurId: string, seuilKmh: number) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');

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
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');

    return prisma.perimetreGeofence.upsert({
      where: { vehiculeId },
      create: { vehiculeId, nom, centreLat, centreLon, rayonMetres },
      update: { nom, centreLat, centreLon, rayonMetres, estActif: true },
    });
  },

  setMode: async (vehiculeId: string, utilisateurId: string, mode: 'WORK' | 'MOVE' | 'STANDBY') => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');

    const updated = await prisma.vehicule.update({
      where: { id: vehiculeId },
      data: { modeActuel: mode },
      select: { id: true, modeActuel: true },
    });

    // Répercute réellement le changement sur le traceur (v10.1) — avant
    // cette version ce champ n'était qu'une étiquette en base, sans aucun
    // effet matériel. On ne bloque pas la réponse si le traceur n'a pas
    // encore d'identifiant MQTT (ex. juste après provisionnement, avant
    // toute connexion).
    if (vehicle.trackerId) {
      await envoyerCommande(vehiculeId, vehicle.trackerId, 'MODE', { valeur: mode });
    }

    return updated;
  },

  // Numéro qui reçoit les SMS d'alerte envoyés directement par le traceur
  // (choc, conduite brutale, premier fix...). Même principe que setMode :
  // écrit en base ET poussé au traceur via une commande MQTT.
  setPhoneAlerte: async (vehiculeId: string, utilisateurId: string, telephone: string) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');
    if (!NUMERO_SMS_REGEX.test(telephone)) {
      throw new AppError('Numéro invalide (format attendu : +237XXXXXXXXX)', 400);
    }

    const updated = await prisma.vehicule.update({
      where: { id: vehiculeId },
      data: { telephoneAlerte: telephone },
      select: { id: true, telephoneAlerte: true },
    });

    if (vehicle.trackerId) {
      await envoyerCommande(vehiculeId, vehicle.trackerId, 'NUMERO_SMS', { valeur: telephone });
    }

    return updated;
  },

  // Commandes ponctuelles (LOCALISER / REDEMARRER / RESET_USINE) — voir
  // aussi setMode et setPhoneAlerte ci-dessus pour MODE/NUMERO_SMS,
  // déclenchées par un champ dédié existant plutôt que par ce chemin
  // générique.
  sendCommande: async (
    vehiculeId: string,
    utilisateurId: string,
    codeCommande: CodeCommande,
    parametres?: Record<string, unknown>
  ) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');
    if (!vehicle.trackerId) {
      throw new AppError("Ce traceur n'a pas encore d'identifiant MQTT connu — commande impossible.", 400);
    }

    return envoyerCommande(vehiculeId, vehicle.trackerId, codeCommande, parametres);
  },

  getCommandes: async (vehiculeId: string, utilisateurId: string) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');

    return prisma.commandeDescendante.findMany({
      where: { vehiculeId },
      orderBy: { dateEnvoi: 'desc' },
      take: 20,
    });
  },

  getLastPosition: async (vehiculeId: string, utilisateurId: string) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');

    return prisma.position.findFirst({
      where: { vehiculeId },
      orderBy: { horodatage: 'desc' },
    });
  },

  getPositionHistory: async (vehiculeId: string, utilisateurId: string, date: string) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');

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
        niveauBatterie: true, nbSatellites: true, niveauSignal: true,
      },
    });
  },

  getPositionHistoryRange: async (
    vehiculeId: string,
    utilisateurId: string,
    from?: string,
    to?: string
  ) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');

    return prisma.position.findMany({
      where: {
        vehiculeId,
        ...(from || to ? {
          horodatage: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        } : {}),
      },
      orderBy: { horodatage: 'asc' },
      select: {
        id: true, latitude: true, longitude: true,
        vitesse: true, cap: true, horodatage: true,
        niveauBatterie: true, nbSatellites: true, niveauSignal: true,
      },
    });
  },

  getDailyReport: async (vehiculeId: string, utilisateurId: string, date: string) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');

    return prisma.rapportJournalier.findFirst({
      where: { vehiculeId, date: new Date(date) },
    });
  },

  getAlarmes: async (vehiculeId: string, utilisateurId: string) => {
    const vehicle = await prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');

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
    if (!alarme) throw new NotFoundError('Alarme introuvable');

    return prisma.alarme.update({
      where: { id: alarmeId },
      data: { estAcquittee: true, dateAcquittement: new Date() },
    });
  },

  deleteAlarme: async (alarmeId: string, utilisateurId: string) => {
    const alarme = await prisma.alarme.findFirst({
      where: { id: alarmeId, vehicule: { utilisateurId } },
    });
    if (!alarme) throw new NotFoundError('Alarme introuvable');

    await prisma.alarme.delete({ where: { id: alarmeId } });
  },
};