"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAllReports = exports.generateVehicleReport = exports.computeDayStats = exports.toIsoDateDouala = void 0;
const database_1 = require("../config/database");
const geo_1 = require("../utils/geo");
const dayBounds_1 = require("../utils/dayBounds");
// Convertit une Date (instant quelconque) en "jour calendaire" à Douala,
// au format YYYY-MM-DD — jamais `.toISOString().split('T')[0]` seul, qui
// donnerait le jour calendaire UTC (décalé d'~1h par rapport à Douala).
const toIsoDateDouala = (date) => new Date(date.getTime() + dayBounds_1.TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);
exports.toIsoDateDouala = toIsoDateDouala;
/**
 * Calcule toutes les statistiques de la journée (calendaire, Douala) pour un
 * véhicule.
 */
const computeDayStats = async (vehiculeId, isoDate) => {
    // Bornes de la journée — en heure de Douala (voir utils/dayBounds), jamais
    // en heure locale du process serveur (souvent UTC en prod), sinon le
    // rapport agrège le mauvais jour calendaire.
    const { start, end } = (0, dayBounds_1.dayBounds)(isoDate);
    // Récupérer toutes les positions du jour ordonnées
    const positions = await database_1.prisma.position.findMany({
        where: {
            vehiculeId,
            horodatage: { gte: start, lte: end },
        },
        orderBy: { horodatage: 'asc' },
        select: {
            latitude: true,
            longitude: true,
            vitesse: true,
            horodatage: true,
        },
    });
    // Compter les alarmes du jour
    const nbAlarmes = await database_1.prisma.alarme.count({
        where: {
            vehiculeId,
            horodatage: { gte: start, lte: end },
        },
    });
    // Cas : aucune position
    if (positions.length === 0) {
        return {
            distanceTotaleKm: 0,
            vitesseMoyenne: 0,
            vitesseMax: 0,
            nbAlarmes,
            tempsArretMinutes: 0,
        };
    }
    // Calcul distance totale (somme des segments entre positions consécutives)
    let distanceTotaleKm = 0;
    let sommeVitesses = 0;
    let vitesseMax = 0;
    let tempsArretMs = 0;
    const SEUIL_ARRET_KMH = 3; // En dessous = considéré à l'arrêt
    for (let i = 1; i < positions.length; i++) {
        const prev = positions[i - 1];
        const curr = positions[i];
        // Distance segment
        const segmentKm = (0, geo_1.haversineKm)(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
        distanceTotaleKm += segmentKm;
        // Vitesse max
        if (curr.vitesse > vitesseMax)
            vitesseMax = curr.vitesse;
        // Somme vitesses pour moyenne
        sommeVitesses += curr.vitesse;
        // Temps d'arrêt : si les deux points sont à l'arrêt
        if (prev.vitesse <= SEUIL_ARRET_KMH && curr.vitesse <= SEUIL_ARRET_KMH) {
            const diffMs = new Date(curr.horodatage).getTime() -
                new Date(prev.horodatage).getTime();
            tempsArretMs += diffMs;
        }
    }
    const vitesseMoyenne = sommeVitesses / (positions.length - 1);
    const tempsArretMinutes = Math.round(tempsArretMs / 60000);
    return {
        distanceTotaleKm: Math.round(distanceTotaleKm * 10) / 10,
        vitesseMoyenne: Math.round(vitesseMoyenne * 10) / 10,
        vitesseMax: Math.round(vitesseMax * 10) / 10,
        nbAlarmes,
        tempsArretMinutes,
    };
};
exports.computeDayStats = computeDayStats;
/**
 * Génère le rapport journalier pour UN véhicule
 */
const generateVehicleReport = async (vehiculeId, date) => {
    try {
        // Résolu UNE SEULE FOIS puis réutilisé pour la requête ET la colonne
        // `date` stockée — sinon un dérivé différent (ex. `.toISOString()` brut,
        // en UTC) pourrait enregistrer le rapport sous un autre jour calendaire
        // que celui réellement agrégé par computeDayStats.
        const isoDate = (0, exports.toIsoDateDouala)(date);
        const stats = await (0, exports.computeDayStats)(vehiculeId, isoDate);
        // Upsert : crée ou écrase si le rapport existe déjà
        await database_1.prisma.rapportJournalier.upsert({
            where: {
                vehiculeId_date: {
                    vehiculeId,
                    date: new Date(isoDate),
                },
            },
            create: {
                vehiculeId,
                date: new Date(isoDate),
                distanceTotaleKm: stats.distanceTotaleKm,
                vitesseMoyenne: stats.vitesseMoyenne,
                vitesseMax: stats.vitesseMax,
                nbAlarmes: stats.nbAlarmes,
                tempsArretMinutes: stats.tempsArretMinutes,
            },
            update: {
                distanceTotaleKm: stats.distanceTotaleKm,
                vitesseMoyenne: stats.vitesseMoyenne,
                vitesseMax: stats.vitesseMax,
                nbAlarmes: stats.nbAlarmes,
                tempsArretMinutes: stats.tempsArretMinutes,
            },
        });
        console.log(`[RAPPORT] ✓ ${vehiculeId} — ${isoDate}` +
            ` — ${stats.distanceTotaleKm}km — max:${stats.vitesseMax}km/h — alertes:${stats.nbAlarmes}`);
    }
    catch (err) {
        console.error(`[RAPPORT] ✗ Erreur véhicule ${vehiculeId} :`, err);
    }
};
exports.generateVehicleReport = generateVehicleReport;
/**
 * Génère les rapports pour TOUS les véhicules actifs
 */
const generateAllReports = async (date) => {
    console.log(`\n[CRON] ══ Génération rapports — ${date.toISOString().split('T')[0]} ══`);
    const vehicules = await database_1.prisma.vehicule.findMany({
        where: { estActif: true },
        select: { id: true, nom: true, utilisateurId: true },
    });
    if (vehicules.length === 0) {
        console.log('[CRON] Aucun véhicule actif à traiter.');
        return;
    }
    console.log(`[CRON] ${vehicules.length} véhicule(s) à traiter...`);
    // Générer tous les rapports en parallèle
    await Promise.allSettled(vehicules.map(v => (0, exports.generateVehicleReport)(v.id, date)));
    console.log(`[CRON] ══ Rapports terminés ══\n`);
};
exports.generateAllReports = generateAllReports;
