import {prisma} from '../config/database';
import { AppError, NotFoundError } from '../utils/errors';
import { findVehiculeByIdentifier } from './vehicle-lookup.service';
import { publishCommand } from '../tracker/mqtt.client';
import { EN_LIGNE_SEUIL_MS } from '../utils/constants';
import { dayBounds } from '../utils/dayBounds';

export type CodeCommande = 'LOCALISER' | 'MODE' | 'REDEMARRER' | 'RESET_USINE' | 'NUMERO_SMS';

// Vérifie l'appartenance du véhicule quand un propriétaire est fourni (app
// mobile). Sans propriétaire (dashboard admin, rôle ADMIN déjà validé par le
// middleware), l'accès n'est pas restreint.
const findOwnedVehicle = (vehiculeId: string, utilisateurId?: string) =>
  utilisateurId
    ? prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } })
    : prisma.vehicule.findUnique({ where: { id: vehiculeId } });

const findOwnedAlarme = (alarmeId: string, utilisateurId?: string) =>
  utilisateurId
    ? prisma.alarme.findFirst({ where: { id: alarmeId, vehicule: { utilisateurId } } })
    : prisma.alarme.findUnique({ where: { id: alarmeId } });

// Format international minimal (+237XXXXXXXXX) — le firmware refait de
// toute façon sa propre validation avant d'accepter la commande, celle-ci
// n'est là que pour rejeter les erreurs de saisie évidentes tout de suite.
export const NUMERO_SMS_REGEX = /^\+[1-9]\d{7,14}$/;

// Crée la commande en base (PENDING) puis la publie sur le topic MQTT du
// traceur. Si la publication échoue immédiatement (canal MQTT indisponible
// — cf. `publishCommand` qui renvoie false quand le client n'est pas
// connecté), on marque tout de suite FAILED plutôt que de laisser la
// commande PENDING pour toujours : sans ça, seul le cron de nettoyage des
// commandes expirées la ferait disparaître, des dizaines de minutes plus
// tard.
export const envoyerCommande = async (
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

  // Mêmes données que la vue admin (admin.service.getVehicules) : chaque
  // traceur renvoie sa dernière position connue + son statut « en ligne »,
  // calculé à partir de la VRAIE dernière communication du traceur — les
  // clients (web et mobile) n'ont plus à ré-interroger une position par
  // traceur pour afficher la carte.
  getVehicles: async (utilisateurId: string) => {
    const vehicules = await prisma.vehicule.findMany({
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

    const dernieres = await prisma.position.findMany({
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
        ...v,
        latitude: pos?.latitude ?? null,
        longitude: pos?.longitude ?? null,
        enLigne: !!v.derniereCommunication && maintenant - v.derniereCommunication.getTime() < EN_LIGNE_SEUIL_MS,
      };
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

  setSpeedLimit: async (vehiculeId: string, utilisateurId: string | undefined, seuilKmh: number) => {
    const vehicle = await findOwnedVehicle(vehiculeId, utilisateurId);
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');

    return prisma.limiteVitesse.upsert({
      where: { vehiculeId },
      create: { vehiculeId, seuilKmh, estActive: true },
      update: { seuilKmh, estActive: true },
    });
  },

  setGeofence: async (
    vehiculeId: string,
    utilisateurId: string | undefined,
    nom: string,
    centreLat: number,
    centreLon: number,
    rayonMetres: number
  ) => {
    const vehicle = await findOwnedVehicle(vehiculeId, utilisateurId);
    if (!vehicle) throw new NotFoundError('Véhicule introuvable');

    return prisma.perimetreGeofence.upsert({
      where: { vehiculeId },
      create: { vehiculeId, nom, centreLat, centreLon, rayonMetres },
      update: { nom, centreLat, centreLon, rayonMetres, estActif: true },
    });
  },

  setMode: async (vehiculeId: string, utilisateurId: string | undefined, mode: 'WORK' | 'MOVE' | 'STANDBY') => {
    const vehicle = await findOwnedVehicle(vehiculeId, utilisateurId);
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
  setPhoneAlerte: async (vehiculeId: string, utilisateurId: string | undefined, telephone: string) => {
    const vehicle = await findOwnedVehicle(vehiculeId, utilisateurId);
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
    utilisateurId: string | undefined,
    codeCommande: CodeCommande,
    parametres?: Record<string, unknown>
  ) => {
    const vehicle = await findOwnedVehicle(vehiculeId, utilisateurId);
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

    // Bornes en heure de Douala (voir utils/dayBounds), pas en heure locale
    // du process serveur — sinon l'historique affiché à l'utilisateur est
    // décalé d'environ 1h par rapport au vrai jour calendaire.
    const { start, end } = dayBounds(date);

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
      // Plafond dur : sans from/to (ou avec une plage très large), une requête
      // replay ne doit pas pouvoir ramener des centaines de milliers de lignes.
      take: 10_000,
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

  acquitAlarme: async (alarmeId: string, utilisateurId?: string) => {
    const alarme = await findOwnedAlarme(alarmeId, utilisateurId);
    if (!alarme) throw new NotFoundError('Alarme introuvable');

    return prisma.alarme.update({
      where: { id: alarmeId },
      data: { estAcquittee: true, dateAcquittement: new Date() },
    });
  },

  deleteAlarme: async (alarmeId: string, utilisateurId?: string) => {
    const alarme = await findOwnedAlarme(alarmeId, utilisateurId);
    if (!alarme) throw new NotFoundError('Alarme introuvable');

    await prisma.alarme.delete({ where: { id: alarmeId } });
  },
};