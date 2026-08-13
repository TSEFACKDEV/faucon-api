"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.vehicleService = exports.envoyerCommande = exports.NUMERO_SMS_REGEX = void 0;
const database_1 = require("../config/database");
const errors_1 = require("../utils/errors");
const vehicle_lookup_service_1 = require("./vehicle-lookup.service");
const mqtt_client_1 = require("../tracker/mqtt.client");
const constants_1 = require("../utils/constants");
// Vérifie l'appartenance du véhicule quand un propriétaire est fourni (app
// mobile). Sans propriétaire (dashboard admin, rôle ADMIN déjà validé par le
// middleware), l'accès n'est pas restreint.
const findOwnedVehicle = (vehiculeId, utilisateurId) => utilisateurId
    ? database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } })
    : database_1.prisma.vehicule.findUnique({ where: { id: vehiculeId } });
const findOwnedAlarme = (alarmeId, utilisateurId) => utilisateurId
    ? database_1.prisma.alarme.findFirst({ where: { id: alarmeId, vehicule: { utilisateurId } } })
    : database_1.prisma.alarme.findUnique({ where: { id: alarmeId } });
// Format international minimal (+237XXXXXXXXX) — le firmware refait de
// toute façon sa propre validation avant d'accepter la commande, celle-ci
// n'est là que pour rejeter les erreurs de saisie évidentes tout de suite.
exports.NUMERO_SMS_REGEX = /^\+[1-9]\d{7,14}$/;
// Crée la commande en base (PENDING) puis la publie sur le topic MQTT du
// traceur. Si la publication échoue immédiatement (canal MQTT indisponible
// — cf. `publishCommand` qui renvoie false quand le client n'est pas
// connecté), on marque tout de suite FAILED plutôt que de laisser la
// commande PENDING pour toujours : sans ça, seul le cron de nettoyage des
// commandes expirées la ferait disparaître, des dizaines de minutes plus
// tard.
const envoyerCommande = async (vehiculeId, trackerId, codeCommande, parametres) => {
    const commande = await database_1.prisma.commandeDescendante.create({
        data: { vehiculeId, codeCommande, parametres: parametres, statutExecution: 'PENDING' },
    });
    const envoyee = (0, mqtt_client_1.publishCommand)(trackerId, {
        id: commande.id,
        cmd: codeCommande,
        valeur: parametres?.valeur,
    });
    if (!envoyee) {
        return database_1.prisma.commandeDescendante.update({
            where: { id: commande.id },
            data: { statutExecution: 'FAILED', dateReponse: new Date() },
        });
    }
    return commande;
};
exports.envoyerCommande = envoyerCommande;
exports.vehicleService = {
    addVehicle: async (utilisateurId, identifier, nom, pin) => {
        const existing = await (0, vehicle_lookup_service_1.findVehiculeByIdentifier)(identifier);
        if (!existing) {
            throw new errors_1.NotFoundError('Traceur non enregistré. Veuillez vérifier l’identifiant du boîtier.');
        }
        if (existing.utilisateurId && existing.utilisateurId !== utilisateurId) {
            throw new errors_1.AppError('Ce traceur est déjà connecté à un autre compte.', 409);
        }
        // Le PIN n'est exigé qu'au moment du premier rattachement (le traceur
        // n'a pas encore de propriétaire) — un traceur provisionné en série a
        // toujours un pinActivation ; les anciens traceurs de démo/seed n'en ont
        // pas et restent réclamables sans PIN.
        if (!existing.utilisateurId && existing.pinActivation) {
            if (!pin || pin.toUpperCase() !== existing.pinActivation) {
                throw new errors_1.AppError('Code d’activation invalide. Vérifiez le PIN imprimé sur le boîtier.', 400);
            }
        }
        const updateData = {
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
        return database_1.prisma.vehicule.update({
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
    getVehicles: async (utilisateurId) => {
        const vehicules = await database_1.prisma.vehicule.findMany({
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
                ...v,
                latitude: pos?.latitude ?? null,
                longitude: pos?.longitude ?? null,
                enLigne: !!v.derniereCommunication && maintenant - v.derniereCommunication.getTime() < constants_1.EN_LIGNE_SEUIL_MS,
            };
        });
    },
    getVehicleById: async (id, utilisateurId) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({
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
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return vehicle;
    },
    updateVehicle: async (id, utilisateurId, data) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.vehicule.update({
            where: { id },
            data,
            select: { id: true, nom: true, image: true },
        });
    },
    deleteVehicle: async (id, utilisateurId) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        await database_1.prisma.vehicule.delete({ where: { id } });
    },
    setSpeedLimit: async (vehiculeId, utilisateurId, seuilKmh) => {
        const vehicle = await findOwnedVehicle(vehiculeId, utilisateurId);
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.limiteVitesse.upsert({
            where: { vehiculeId },
            create: { vehiculeId, seuilKmh, estActive: true },
            update: { seuilKmh, estActive: true },
        });
    },
    setGeofence: async (vehiculeId, utilisateurId, nom, centreLat, centreLon, rayonMetres) => {
        const vehicle = await findOwnedVehicle(vehiculeId, utilisateurId);
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.perimetreGeofence.upsert({
            where: { vehiculeId },
            create: { vehiculeId, nom, centreLat, centreLon, rayonMetres },
            update: { nom, centreLat, centreLon, rayonMetres, estActif: true },
        });
    },
    setMode: async (vehiculeId, utilisateurId, mode) => {
        const vehicle = await findOwnedVehicle(vehiculeId, utilisateurId);
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        const updated = await database_1.prisma.vehicule.update({
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
            await (0, exports.envoyerCommande)(vehiculeId, vehicle.trackerId, 'MODE', { valeur: mode });
        }
        return updated;
    },
    // Numéro qui reçoit les SMS d'alerte envoyés directement par le traceur
    // (choc, conduite brutale, premier fix...). Même principe que setMode :
    // écrit en base ET poussé au traceur via une commande MQTT.
    setPhoneAlerte: async (vehiculeId, utilisateurId, telephone) => {
        const vehicle = await findOwnedVehicle(vehiculeId, utilisateurId);
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        if (!exports.NUMERO_SMS_REGEX.test(telephone)) {
            throw new errors_1.AppError('Numéro invalide (format attendu : +237XXXXXXXXX)', 400);
        }
        const updated = await database_1.prisma.vehicule.update({
            where: { id: vehiculeId },
            data: { telephoneAlerte: telephone },
            select: { id: true, telephoneAlerte: true },
        });
        if (vehicle.trackerId) {
            await (0, exports.envoyerCommande)(vehiculeId, vehicle.trackerId, 'NUMERO_SMS', { valeur: telephone });
        }
        return updated;
    },
    // Commandes ponctuelles (LOCALISER / REDEMARRER / RESET_USINE) — voir
    // aussi setMode et setPhoneAlerte ci-dessus pour MODE/NUMERO_SMS,
    // déclenchées par un champ dédié existant plutôt que par ce chemin
    // générique.
    sendCommande: async (vehiculeId, utilisateurId, codeCommande, parametres) => {
        const vehicle = await findOwnedVehicle(vehiculeId, utilisateurId);
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        if (!vehicle.trackerId) {
            throw new errors_1.AppError("Ce traceur n'a pas encore d'identifiant MQTT connu — commande impossible.", 400);
        }
        return (0, exports.envoyerCommande)(vehiculeId, vehicle.trackerId, codeCommande, parametres);
    },
    getCommandes: async (vehiculeId, utilisateurId) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.commandeDescendante.findMany({
            where: { vehiculeId },
            orderBy: { dateEnvoi: 'desc' },
            take: 20,
        });
    },
    getLastPosition: async (vehiculeId, utilisateurId) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.position.findFirst({
            where: { vehiculeId },
            orderBy: { horodatage: 'desc' },
        });
    },
    getPositionHistory: async (vehiculeId, utilisateurId, date) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        return database_1.prisma.position.findMany({
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
    getPositionHistoryRange: async (vehiculeId, utilisateurId, from, to) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.position.findMany({
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
    getDailyReport: async (vehiculeId, utilisateurId, date) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.rapportJournalier.findFirst({
            where: { vehiculeId, date: new Date(date) },
        });
    },
    getAlarmes: async (vehiculeId, utilisateurId) => {
        const vehicle = await database_1.prisma.vehicule.findFirst({ where: { id: vehiculeId, utilisateurId } });
        if (!vehicle)
            throw new errors_1.NotFoundError('Véhicule introuvable');
        return database_1.prisma.alarme.findMany({
            where: { vehiculeId },
            orderBy: { horodatage: 'desc' },
            take: 50,
        });
    },
    acquitAlarme: async (alarmeId, utilisateurId) => {
        const alarme = await findOwnedAlarme(alarmeId, utilisateurId);
        if (!alarme)
            throw new errors_1.NotFoundError('Alarme introuvable');
        return database_1.prisma.alarme.update({
            where: { id: alarmeId },
            data: { estAcquittee: true, dateAcquittement: new Date() },
        });
    },
    deleteAlarme: async (alarmeId, utilisateurId) => {
        const alarme = await findOwnedAlarme(alarmeId, utilisateurId);
        if (!alarme)
            throw new errors_1.NotFoundError('Alarme introuvable');
        await database_1.prisma.alarme.delete({ where: { id: alarmeId } });
    },
};
