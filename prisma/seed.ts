import bcrypt from 'bcryptjs';

import { PrismaPg } from '@prisma/adapter-pg'


import { PrismaClient } from '../src/generated/prisma/client'
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter, log: ['error'] })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// ═══════════════════════════════════════════════
// DONNÉES DE TEST — À utiliser pour les tests
// ═══════════════════════════════════════════════
//
// COMPTE ADMINISTRATEUR
// Email    : admin@faucon.cm
// Password : Faucon2025!
// UserName : MAKA MAKA
//
// COMPTE DE TEST
// Email    : user@faucon.cm
// Password : User2026!
// UserName : TEST USER
//
// DISPOSITIFS ENREGISTRÉS (déjà réclamés, aucun PIN requis)
// TRACKER-001 → Container Nord  — IMEI: 358000000000421
// TRACKER-002 → Container Sud   — IMEI: 358000000000518
// TRACKER-003 → Container Est   — IMEI: 358000000000733
// TRACKER-004 → Container Ouest — IMEI: 358000000000821
//
// DISPOSITIFS PROVISIONNÉS NON RÉCLAMÉS (PIN requis pour /vehicles/connect)
// TRACKER-005 → IMEI: 358000000000999 — PIN: K7M2QX
// FCN-9001    → traceur "sortie d'usine", aucune position — PIN: P9X3TR
//
// TCP TEST (netcat localhost 5000) :
// Copier les trames depuis la section TCP ci-dessous
// ═══════════════════════════════════════════════

async function main() {
  console.log('\n🌱 Début du seed...\n');

  // ─── NETTOYAGE ────────────────────────────────────────────────
  await prisma.commandeDescendante.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.alarme.deleteMany();
  await prisma.rapportJournalier.deleteMany();
  await prisma.sessionTrajet.deleteMany();
  await prisma.position.deleteMany();
  await prisma.perimetreGeofence.deleteMany();
  await prisma.limiteVitesse.deleteMany();
  await prisma.vehicule.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.utilisateur.deleteMany();

  console.log('✓ Base nettoyée');

  // ─── UTILISATEUR ──────────────────────────────────────────────
  const hash = await bcrypt.hash('Faucon2025!', 12);

  const admin = await prisma.utilisateur.create({
    data: {
      id:            'usr-001-faucon-admin',
      userName:      'MAKA MAKA',
      email:         'admin@faucon.cm',
      motDePasseHash: hash,
      telephone:     '+237 6 55 12 34 56',
      dateCreation:  new Date('2025-01-15T08:00:00Z'),
      derniereConnexion: new Date('2026-07-03T09:00:00Z'),
    },
  });

  console.log(`✓ Administrateur créé : ${admin.email}`);

  const demoUser = await prisma.utilisateur.create({
    data: {
      id:              'usr-002-faucon-test',
      userName:        'TEST USER',
      email:           'user@faucon.cm',
      motDePasseHash:  await bcrypt.hash('User2026!', 12),
      telephone:       '+237 6 66 11 22 33',
      dateCreation:    new Date('2026-06-01T08:00:00Z'),
      derniereConnexion: new Date('2026-07-03T09:05:00Z'),
    },
  });

  console.log(`✓ Utilisateur de test créé : ${demoUser.email}`);

  // ─── VÉHICULE 1 — Container Nord ─────────────────────────────
  const v1 = await prisma.vehicule.create({
    data: {
      id:             'veh-001-container-nord',
      imei:           '358000000000421',
      trackerId:      'TRACKER-001',
      nom:            'Container Nord',
      modeActuel:     'WORK',
      niveauBatterie: 82,
      estActif:       true,
      utilisateurId:  admin.id,
      derniereCommunication: new Date('2026-07-03T09:55:00Z'),
    },
  });

  await prisma.limiteVitesse.create({
    data: {
      vehiculeId: v1.id,
      seuilKmh:   90,
      estActive:  true,
    },
  });

  await prisma.perimetreGeofence.create({
    data: {
      vehiculeId:  v1.id,
      nom:         'Zone Port de Douala',
      centreLat:   4.0500,
      centreLon:   9.7679,
      rayonMetres: 5000,
      estActif:    true,
    },
  });

  // ─── VÉHICULE 2 — Container Sud ──────────────────────────────
  const v2 = await prisma.vehicule.create({
    data: {
      id:             'veh-002-container-sud',
      imei:           '358000000000518',
      trackerId:      'TRACKER-002',
      nom:            'Container Sud',
      modeActuel:     'MOVE',
      niveauBatterie: 46,
      estActif:       true,
      utilisateurId:  admin.id,
      derniereCommunication: new Date('2026-07-03T08:45:00Z'),
    },
  });

  await prisma.limiteVitesse.create({
    data: {
      vehiculeId: v2.id,
      seuilKmh:   80,
      estActive:  true,
    },
  });

  await prisma.perimetreGeofence.create({
    data: {
      vehiculeId:  v2.id,
      nom:         'Zone Industrielle Bassa',
      centreLat:   4.0200,
      centreLon:   9.7400,
      rayonMetres: 3000,
      estActif:    true,
    },
  });

  // ─── VÉHICULE 3 — Container Est ──────────────────────────────
  const v3 = await prisma.vehicule.create({
    data: {
      id:             'veh-003-container-est',
      imei:           '358000000000733',
      trackerId:      'FCN-0733',
      nom:            'Container Est',
      modeActuel:     'STANDBY',
      niveauBatterie: 12,
      estActif:       true,
      utilisateurId:  admin.id,
      derniereCommunication: new Date('2026-07-03T07:30:00Z'),
    },
  });

  await prisma.limiteVitesse.create({
    data: {
      vehiculeId: v3.id,
      seuilKmh:   70,
      estActive:  true,
    },
  });

  await prisma.perimetreGeofence.create({
    data: {
      vehiculeId:  v3.id,
      nom:         'Zone Atelier Container Est',
      centreLat:   4.0360,
      centreLon:   9.7620,
      rayonMetres: 2000,
      estActif:    true,
    },
  });

  // ─── VÉHICULE 4 — Container Ouest ────────────────────────────
  const v4 = await prisma.vehicule.create({
    data: {
      id:             'veh-004-container-ouest',
      imei:           '358000000000821',      trackerId:      'TRACKER-004',      nom:            'Container Ouest',
      modeActuel:     'MOVE',
      niveauBatterie: 68,
      estActif:       true,
      utilisateurId:  demoUser.id,
      derniereCommunication: new Date('2026-07-03T09:40:00Z'),
    },
  });

  await prisma.limiteVitesse.create({
    data: {
      vehiculeId: v4.id,
      seuilKmh:   100,
      estActive:  true,
    },
  });

  await prisma.perimetreGeofence.create({
    data: {
      vehiculeId:  v4.id,
      nom:         'Zone Nsimalen Yaounde',
      centreLat:   3.7225,
      centreLon:   11.5533,
      rayonMetres: 8000,
      estActif:    true,
    },
  });

  // ─── VÉHICULE 5 — provisionné, jamais réclamé (a déjà transmis) ──
  // Simule un traceur vendu, allumé au moins une fois, mais pas encore
  // rattaché à un compte : pinActivation exigé par vehicleService.addVehicle.
  const v5 = await prisma.vehicule.create({
    data: {
      id:             'veh-005-tracker-non-assigne',
      imei:           '358000000000999',
      trackerId:      'TRACKER-005',
      pinActivation:  'K7M2QX',
      nom:            'Traceur non assigné',
      modeActuel:     'STANDBY',
      niveauBatterie: 100,
      estActif:       false,
      utilisateurId:  null,
      derniereCommunication: new Date('2026-07-03T10:00:00Z'),
    },
  });

  // ─── VÉHICULE 6 — fraîchement provisionné, jamais allumé ─────────
  // Représente le résultat direct de POST /admin/vehicules/provision :
  // aucune position, aucune communication, juste trackerId + PIN en attente
  // de flashage/vente. Sert à tester le flux de claim de bout en bout.
  const v6 = await prisma.vehicule.create({
    data: {
      id:             'veh-006-fcn-9001-neuf',
      trackerId:      'FCN-9001',
      pinActivation:  'P9X3TR',
      nom:            'Traceur FCN-9001',
      modeActuel:     'MOVE',
      niveauBatterie: 100,
      estActif:       false,
      utilisateurId:  null,
      derniereCommunication: null,
    },
  });

  console.log('✓ 4 véhicules créés avec limites et géorepérages');
  console.log(`✓ Traceur pré-enregistré disponible pour revendication : ${v5.trackerId} (PIN ${v5.pinActivation})`);
  console.log(`✓ Traceur "sortie d'usine" jamais allumé : ${v6.trackerId} (PIN ${v6.pinActivation})`);

  // ─── POSITIONS — Container Nord (trajet Douala port) ─────────
  // Trajet : Port Autonome de Douala → Zone Logistique Bonabéri
  // Date   : 2026-07-02 matin
  const positionsV1 = [
    { lat: 4.0511, lon: 9.7679, speed: 0,  cap: 0,   battery: 84, acc: false, ts: '2026-07-02T06:00:00Z' },
    { lat: 4.0515, lon: 9.7685, speed: 12, cap: 45,  battery: 84, acc: true,  ts: '2026-07-02T06:05:00Z' },
    { lat: 4.0525, lon: 9.7700, speed: 28, cap: 90,  battery: 83, acc: true,  ts: '2026-07-02T06:10:00Z' },
    { lat: 4.0530, lon: 9.7720, speed: 45, cap: 95,  battery: 83, acc: true,  ts: '2026-07-02T06:15:00Z' },
    { lat: 4.0528, lon: 9.7750, speed: 54, cap: 88,  battery: 83, acc: true,  ts: '2026-07-02T06:20:00Z' },
    { lat: 4.0522, lon: 9.7780, speed: 54, cap: 85,  battery: 82, acc: true,  ts: '2026-07-02T06:25:00Z' },
    { lat: 4.0518, lon: 9.7800, speed: 48, cap: 82,  battery: 82, acc: true,  ts: '2026-07-02T06:30:00Z' },
    { lat: 4.0512, lon: 9.7820, speed: 38, cap: 78,  battery: 82, acc: true,  ts: '2026-07-02T06:35:00Z' },
    { lat: 4.0505, lon: 9.7835, speed: 25, cap: 75,  battery: 82, acc: true,  ts: '2026-07-02T06:40:00Z' },
    { lat: 4.0498, lon: 9.7842, speed: 10, cap: 72,  battery: 82, acc: true,  ts: '2026-07-02T06:45:00Z' },
    { lat: 4.0495, lon: 9.7845, speed: 0,  cap: 70,  battery: 82, acc: false, ts: '2026-07-02T06:47:00Z' },
  ];

  for (const p of positionsV1) {
    await prisma.position.create({
      data: {
        vehiculeId:    v1.id,
        latitude:      p.lat,
        longitude:     p.lon,
        vitesse:       p.speed,
        cap:           p.cap,
        niveauBatterie: p.battery,
        statutACC:     p.acc,
        horodatage:    new Date(p.ts),
      },
    });
  }

  // Trajet du 03 juillet 2026 — Container Nord (journée actuelle)
  const positionsV1Today = [
    { lat: 4.0511, lon: 9.7679, speed: 0,  cap: 0,   battery: 84, acc: false, ts: '2026-07-03T07:00:00Z' },
    { lat: 4.0516, lon: 9.7688, speed: 15, cap: 60,  battery: 83, acc: true,  ts: '2026-07-03T07:05:00Z' },
    { lat: 4.0528, lon: 9.7705, speed: 38, cap: 80,  battery: 83, acc: true,  ts: '2026-07-03T07:10:00Z' },
    { lat: 4.0540, lon: 9.7730, speed: 54, cap: 85,  battery: 83, acc: true,  ts: '2026-07-03T07:15:00Z' },
    { lat: 4.0552, lon: 9.7755, speed: 54, cap: 87,  battery: 82, acc: true,  ts: '2026-07-03T07:20:00Z' },
    { lat: 4.0560, lon: 9.7772, speed: 48, cap: 90,  battery: 82, acc: true,  ts: '2026-07-03T07:25:00Z' },
    { lat: 4.0565, lon: 9.7788, speed: 42, cap: 92,  battery: 82, acc: true,  ts: '2026-07-03T07:30:00Z' },
    { lat: 4.0568, lon: 9.7800, speed: 54, cap: 88,  battery: 82, acc: true,  ts: '2026-07-03T07:35:00Z' },
    { lat: 4.0570, lon: 9.7815, speed: 54, cap: 85,  battery: 82, acc: true,  ts: '2026-07-03T07:40:00Z' },
    { lat: 4.0572, lon: 9.7828, speed: 30, cap: 82,  battery: 82, acc: true,  ts: '2026-07-03T07:45:00Z' },
    { lat: 4.0511, lon: 9.7679, speed: 54, cap: 90,  battery: 82, acc: true,  ts: '2026-07-03T09:00:00Z' },
    { lat: 4.0512, lon: 9.7680, speed: 54, cap: 90,  battery: 82, acc: true,  ts: '2026-07-03T09:30:00Z' },
    { lat: 4.0511, lon: 9.7679, speed: 54, cap: 90,  battery: 82, acc: true,  ts: '2026-07-03T09:55:00Z', cyc: 7, alr: 1 },
  ];

  for (const p of positionsV1Today) {
    await prisma.position.create({
      data: {
        vehiculeId:    v1.id,
        latitude:      p.lat,
        longitude:     p.lon,
        vitesse:       p.speed,
        cap:           p.cap,
        niveauBatterie: p.battery,
        statutACC:     p.acc,
        horodatage:    new Date(p.ts),
      },
    });
  }

  // ─── POSITIONS — Container Sud (trajet DIT → Entrepôt PK14) ──
  // Date : 2026-07-02
  const positionsV2 = [
    { lat: 4.0315, lon: 9.7520, speed: 0,  cap: 0,   battery: 50, acc: false, ts: '2026-07-02T10:02:00Z' },
    { lat: 4.0322, lon: 9.7535, speed: 20, cap: 55,  battery: 50, acc: true,  ts: '2026-07-02T10:08:00Z' },
    { lat: 4.0340, lon: 9.7560, speed: 45, cap: 60,  battery: 49, acc: true,  ts: '2026-07-02T10:14:00Z' },
    { lat: 4.0358, lon: 9.7590, speed: 60, cap: 65,  battery: 49, acc: true,  ts: '2026-07-02T10:20:00Z' },
    { lat: 4.0375, lon: 9.7620, speed: 72, cap: 70,  battery: 48, acc: true,  ts: '2026-07-02T10:26:00Z' },
    { lat: 4.0390, lon: 9.7650, speed: 68, cap: 72,  battery: 48, acc: true,  ts: '2026-07-02T10:32:00Z' },
    { lat: 4.0400, lon: 9.7670, speed: 55, cap: 75,  battery: 48, acc: true,  ts: '2026-07-02T10:38:00Z' },
    { lat: 4.0408, lon: 9.7690, speed: 38, cap: 78,  battery: 47, acc: true,  ts: '2026-07-02T10:44:00Z' },
    { lat: 4.0412, lon: 9.7700, speed: 20, cap: 80,  battery: 47, acc: true,  ts: '2026-07-02T10:50:00Z' },
    { lat: 4.0415, lon: 9.7705, speed: 0,  cap: 80,  battery: 47, acc: false, ts: '2026-07-02T11:04:00Z', cyc: 3, alr: 0 },
  ];

  for (const p of positionsV2) {
    await prisma.position.create({
      data: {
        vehiculeId:    v2.id,
        latitude:      p.lat,
        longitude:     p.lon,
        vitesse:       p.speed,
        cap:           p.cap,
        niveauBatterie: p.battery,
        statutACC:     p.acc,
        horodatage:    new Date(p.ts),
      },
    });
  }

  // ─── POSITIONS — Container Ouest (Douala → Yaoundé) ──────────
  // Trajet longue distance : 241 km
  // Date : 2026-07-01
  const positionsV4Long = [
    { lat: 4.0490, lon: 9.7650, speed: 0,   cap: 90,  battery: 72, acc: false, ts: '2026-07-01T16:38:00Z' },
    { lat: 4.0495, lon: 9.7700, speed: 45,  cap: 90,  battery: 72, acc: true,  ts: '2026-07-01T16:45:00Z' },
    { lat: 4.0500, lon: 9.7800, speed: 80,  cap: 90,  battery: 71, acc: true,  ts: '2026-07-01T16:55:00Z' },
    { lat: 4.0450, lon: 9.8200, speed: 90,  cap: 92,  battery: 71, acc: true,  ts: '2026-07-01T17:10:00Z' },
    { lat: 4.0200, lon: 9.9000, speed: 95,  cap: 90,  battery: 70, acc: true,  ts: '2026-07-01T17:30:00Z' },
    { lat: 3.9800, lon: 9.9800, speed: 98,  cap: 88,  battery: 70, acc: true,  ts: '2026-07-01T17:50:00Z' },
    { lat: 3.9200, lon: 10.100, speed: 92,  cap: 85,  battery: 69, acc: true,  ts: '2026-07-01T18:15:00Z' },
    { lat: 3.8500, lon: 10.250, speed: 88,  cap: 83,  battery: 69, acc: true,  ts: '2026-07-01T18:45:00Z' },
    { lat: 3.8000, lon: 10.450, speed: 95,  cap: 80,  battery: 68, acc: true,  ts: '2026-07-01T19:15:00Z' },
    { lat: 3.7800, lon: 10.700, speed: 90,  cap: 78,  battery: 68, acc: true,  ts: '2026-07-01T19:45:00Z' },
    { lat: 3.7500, lon: 10.950, speed: 85,  cap: 75,  battery: 68, acc: true,  ts: '2026-07-01T20:20:00Z' },
    { lat: 3.7300, lon: 11.200, speed: 80,  cap: 72,  battery: 68, acc: true,  ts: '2026-07-01T21:00:00Z' },
    { lat: 3.7225, lon: 11.500, speed: 45,  cap: 68,  battery: 68, acc: true,  ts: '2026-07-01T21:45:00Z' },
    { lat: 3.7225, lon: 11.553, speed: 0,   cap: 65,  battery: 68, acc: false, ts: '2026-07-01T21:58:00Z', cyc: 12, alr: 1 },
  ];

  for (const p of positionsV4Long) {
    await prisma.position.create({
      data: {
        vehiculeId:    v4.id,
        latitude:      p.lat,
        longitude:     p.lon,
        vitesse:       p.speed,
        cap:           p.cap,
        niveauBatterie: p.battery,
        statutACC:     p.acc,
        horodatage:    new Date(p.ts),
      },
    });
  }

  // Positions aujourd'hui Container Est (FCN-0733)
  const positionsV3Today = [
    { lat: 4.0350, lon: 9.7600, speed: 0,  cap: 0,  battery: 14, acc: false, ts: '2026-07-03T07:00:00Z' },
    { lat: 4.0352, lon: 9.7605, speed: 8,  cap: 30, battery: 13, acc: true,  ts: '2026-07-03T07:15:00Z' },
    { lat: 4.0355, lon: 9.7612, speed: 18, cap: 45, battery: 13, acc: true,  ts: '2026-07-03T07:20:00Z' },
    { lat: 4.0358, lon: 9.7618, speed: 28, cap: 50, battery: 12, acc: true,  ts: '2026-07-03T07:25:00Z' },
    { lat: 4.0360, lon: 9.7622, speed: 38, cap: 52, battery: 12, acc: true,  ts: '2026-07-03T07:30:00Z', cyc: 1, alr: 0 },
  ];

  for (const p of positionsV3Today) {
    await prisma.position.create({
      data: {
        vehiculeId:    v3.id,
        latitude:      p.lat,
        longitude:     p.lon,
        vitesse:       p.speed,
        cap:           p.cap,
        niveauBatterie: p.battery,
        statutACC:     p.acc,
        horodatage:    new Date(p.ts),
      },
    });
  }

  const positionsV2Today = [
    { lat: 4.0330, lon: 9.7530, speed: 0,  cap: 0,  battery: 46, acc: false, ts: '2026-07-03T08:30:00Z' },
    { lat: 4.0342, lon: 9.7548, speed: 18, cap: 60, battery: 46, acc: true,  ts: '2026-07-03T08:40:00Z' },
    { lat: 4.0360, lon: 9.7575, speed: 42, cap: 70, battery: 45, acc: true,  ts: '2026-07-03T08:50:00Z' },
    { lat: 4.0380, lon: 9.7605, speed: 52, cap: 80, battery: 45, acc: true,  ts: '2026-07-03T09:00:00Z' },
    { lat: 4.0398, lon: 9.7630, speed: 36, cap: 90, battery: 45, acc: true,  ts: '2026-07-03T09:10:00Z' },
    { lat: 4.0415, lon: 9.7705, speed: 0,  cap: 0,  battery: 47, acc: false, ts: '2026-07-03T09:20:00Z', cyc: 2, alr: 0 },
  ];

  for (const p of positionsV2Today) {
    await prisma.position.create({
      data: {
        vehiculeId:    v2.id,
        latitude:      p.lat,
        longitude:     p.lon,
        vitesse:       p.speed,
        cap:           p.cap,
        niveauBatterie: p.battery,
        statutACC:     p.acc,
        horodatage:    new Date(p.ts),
      },
    });
  }

  const positionsV4Today = [
    { lat: 3.9225, lon: 10.1000, speed: 88, cap: 80, battery: 68, acc: true,  ts: '2026-07-03T08:15:00Z' },
    { lat: 3.9120, lon: 10.0750, speed: 84, cap: 82, battery: 67, acc: true,  ts: '2026-07-03T08:35:00Z' },
    { lat: 3.8900, lon: 10.0300, speed: 76, cap: 85, battery: 67, acc: true,  ts: '2026-07-03T08:55:00Z' },
    { lat: 3.8600, lon: 9.9800,  speed: 72, cap: 88, battery: 66, acc: true,  ts: '2026-07-03T09:15:00Z' },
    { lat: 3.8300, lon: 9.9400,  speed: 64, cap: 92, battery: 66, acc: true,  ts: '2026-07-03T09:40:00Z' },
    { lat: 3.7960, lon: 9.9100,  speed: 0,  cap: 0,  battery: 65, acc: false, ts: '2026-07-03T10:05:00Z' },
  ];

  for (const p of positionsV4Today) {
    await prisma.position.create({
      data: {
        vehiculeId:    v4.id,
        latitude:      p.lat,
        longitude:     p.lon,
        vitesse:       p.speed,
        cap:           p.cap,
        niveauBatterie: p.battery,
        statutACC:     p.acc,
        horodatage:    new Date(p.ts),
      },
    });
  }

  console.log('✓ Positions historiques créées');

  // ─── SESSIONS TRAJET ──────────────────────────────────────────
  await prisma.sessionTrajet.createMany({
    data: [
      {
        vehiculeId:   v1.id,
        dateDebut:    new Date('2026-07-02T06:00:00Z'),
        dateFin:      new Date('2026-07-02T06:47:00Z'),
        distanceKm:   18.6,
        dureeMinutes: 47,
      },
      {
        vehiculeId:   v2.id,
        dateDebut:    new Date('2026-07-02T10:02:00Z'),
        dateFin:      new Date('2026-07-02T11:04:00Z'),
        distanceKm:   24.1,
        dureeMinutes: 62,
      },
      {
        vehiculeId:   v4.id,
        dateDebut:    new Date('2026-07-01T16:38:00Z'),
        dateFin:      new Date('2026-07-01T21:58:00Z'),
        distanceKm:   241.3,
        dureeMinutes: 320,
      },
      {
        vehiculeId:   v3.id,
        dateDebut:    new Date('2026-07-03T07:00:00Z'),
        dateFin:      new Date('2026-07-03T07:30:00Z'),
        distanceKm:   12.4,
        dureeMinutes: 31,
      },
    ],
  });

  console.log('✓ Sessions de trajet créées');

  // ─── ALARMES ──────────────────────────────────────────────────
  const a1 = await prisma.alarme.create({
    data: {
      vehiculeId:    v3.id,
      typeAlarme:    'DECOLLEMENT_TRACEUR',
      latitude:      4.0358,
      longitude:     9.7618,
      valeurMesuree: 1.0,
      seuilConfigure: 0.5,
      estAcquittee:  false,
      horodatage:    new Date('2026-07-03T11:04:00Z'),
    },
  });

  const a2 = await prisma.alarme.create({
    data: {
      vehiculeId:    v3.id,
      typeAlarme:    'BATTERIE_FAIBLE',
      latitude:      4.0358,
      longitude:     9.7618,
      valeurMesuree: 12,
      seuilConfigure: 20,
      estAcquittee:  false,
      horodatage:    new Date('2026-07-03T10:47:00Z'),
    },
  });

  const a3 = await prisma.alarme.create({
    data: {
      vehiculeId:    v2.id,
      typeAlarme:    'NON_MOUVEMENT',
      latitude:      4.0415,
      longitude:     9.7705,
      valeurMesuree: null,
      seuilConfigure: null,
      estAcquittee:  false,
      horodatage:    new Date('2026-07-03T09:12:00Z'),
    },
  });

  const a4 = await prisma.alarme.create({
    data: {
      vehiculeId:    v4.id,
      typeAlarme:    'BATTERIE_FAIBLE',
      latitude:      3.7225,
      longitude:     11.5533,
      valeurMesuree: 18,
      seuilConfigure: 20,
      estAcquittee:  true,
      dateAcquittement: new Date('2026-07-01T22:30:00Z'),
      horodatage:    new Date('2026-07-01T22:03:00Z'),
    },
  });

  const a5 = await prisma.alarme.create({
    data: {
      vehiculeId:    v2.id,
      typeAlarme:    'VITESSE_EXCESSIVE',
      latitude:      4.0390,
      longitude:     9.7650,
      valeurMesuree: 94,
      seuilConfigure: 80,
      estAcquittee:  true,
      dateAcquittement: new Date('2026-07-02T12:00:00Z'),
      horodatage:    new Date('2026-07-02T10:26:00Z'),
    },
  });

  const a6 = await prisma.alarme.create({
    data: {
      vehiculeId:    v4.id,
      typeAlarme:    'SORTIE_ZONE',
      latitude:      3.8500,
      longitude:     10.2500,
      valeurMesuree: 32000,
      seuilConfigure: 8000,
      estAcquittee:  true,
      dateAcquittement: new Date('2026-07-01T20:00:00Z'),
      horodatage:    new Date('2026-07-01T18:45:00Z'),
    },
  });

  console.log('✓ 6 alarmes créées (2 non acquittées, 4 acquittées)');

  // ─── RAPPORTS JOURNALIERS ─────────────────────────────────────
  await prisma.rapportJournalier.createMany({
    data: [
      {
        vehiculeId:        v1.id,
        date:              new Date('2026-07-02'),
        distanceTotaleKm:  18.6,
        vitesseMoyenne:    33.4,
        vitesseMax:        54.0,
        nbAlarmes:         0,
        tempsArretMinutes: 15,
      },
      {
        vehiculeId:        v2.id,
        date:              new Date('2026-07-02'),
        distanceTotaleKm:  24.1,
        vitesseMoyenne:    44.2,
        vitesseMax:        94.0,
        nbAlarmes:         1,
        tempsArretMinutes: 20,
      },
      {
        vehiculeId:        v4.id,
        date:              new Date('2026-07-01'),
        distanceTotaleKm:  241.3,
        vitesseMoyenne:    76.5,
        vitesseMax:        98.0,
        nbAlarmes:         2,
        tempsArretMinutes: 40,
      },
      {
        vehiculeId:        v3.id,
        date:              new Date('2026-07-03'),
        distanceTotaleKm:  12.4,
        vitesseMoyenne:    18.2,
        vitesseMax:        38.0,
        nbAlarmes:         2,
        tempsArretMinutes: 5,
      },
      {
        vehiculeId:        v1.id,
        date:              new Date('2026-07-03'),
        distanceTotaleKm:  32.1,
        vitesseMoyenne:    42.0,
        vitesseMax:        54.0,
        nbAlarmes:         0,
        tempsArretMinutes: 10,
      },
    ],
  });

  console.log('✓ Rapports journaliers créés');

  // ─── COMMANDES DESCENDANTES ───────────────────────────────────
  await prisma.commandeDescendante.createMany({
    data: [
      {
        vehiculeId:      v1.id,
        codeCommande:    'SET_MODE',
        parametres:      { mode: 'WORK' },
        statutExecution: 'SUCCESS',
        dateEnvoi:       new Date('2026-07-02T06:00:00Z'),
        dateReponse:     new Date('2026-07-02T06:00:15Z'),
      },
      {
        vehiculeId:      v3.id,
        codeCommande:    'SET_SPEED_LIMIT',
        parametres:      { seuilKmh: 70 },
        statutExecution: 'SUCCESS',
        dateEnvoi:       new Date('2026-07-01T10:00:00Z'),
        dateReponse:     new Date('2026-07-01T10:00:20Z'),
      },
      {
        vehiculeId:      v4.id,
        codeCommande:    'GET_POSITION',
        parametres:     {},
        statutExecution: 'SUCCESS',
        dateEnvoi:       new Date('2026-07-03T09:00:00Z'),
        dateReponse:     new Date('2026-07-03T09:00:08Z'),
      },
      {
        vehiculeId:      v2.id,
        codeCommande:    'SET_MODE',
        parametres:      { mode: 'STANDBY' },
        statutExecution: 'PENDING',
        dateEnvoi:       new Date('2026-07-03T10:00:00Z'),
        dateReponse:     null,
      },
    ],
  });

  console.log('✓ Commandes descendantes créées');

  // ─── RÉCAPITULATIF ────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log('  SEED TERMINÉ — DONNÉES DE TEST');
  console.log('════════════════════════════════════════');
  console.log('\n  CONNEXION WEB / API :');
  console.log('  Email    : admin@faucon.cm');
  console.log('  Password : Faucon2025!');
  console.log('  DeviceID : TRACKER-001 (pour le champ ID Dispositif)');
  console.log('\n  VÉHICULES DÉJÀ RÉCLAMÉS :');
  console.log('  Container Nord  → IMEI: 358000000000421 | Batterie: 82% | Mode: WORK');
  console.log('  Container Sud   → IMEI: 358000000000518 | Batterie: 47% | Mode: MOVE');
  console.log('  Container Est   → IMEI: 358000000000733 | Batterie: 12% | Mode: STANDBY ⚠️');
  console.log('  Container Ouest → IMEI: 358000000000821 | Batterie: 65% | Mode: MOVE');
  console.log('\n  VÉHICULES PROVISIONNÉS, NON RÉCLAMÉS (pour tester /vehicles/connect avec PIN) :');
  console.log(`  ${v5.trackerId} (a déjà transmis)    → PIN: ${v5.pinActivation}`);
  console.log(`  ${v6.trackerId} (jamais allumé)      → PIN: ${v6.pinActivation}`);
  console.log('\n  ALARMES NON ACQUITTÉES :');
  console.log('  - Container Est  → DECOLLEMENT_TRACEUR (11:04)');
  console.log('  - Container Est  → BATTERIE_FAIBLE 12% (10:47)');
  console.log('  - Container Sud  → NON_MOUVEMENT (09:12)');
  console.log('\n  TRAMES TCP (port 5000) :');
  console.log('  Voir section TCP ci-dessous dans ce fichier');
  console.log('════════════════════════════════════════\n');
}

// Exemples de trames TCP autorisees par le listener sur le port 5000 :
//
// {"type":"POSITION","imei":"358000000000421","ts":"2026-07-03T09:55:00Z","lat":4.0511,"lon":9.7679,"speed":0,"cap":0,"battery":84}
// {"type":"POSITION","imei":"358000000000518","ts":"2026-07-03T09:20:00Z","lat":4.0415,"lon":9.7705,"speed":0,"cap":0,"battery":47}
// {"type":"POSITION","imei":"358000000000733","ts":"2026-07-03T07:30:00Z","lat":4.0360,"lon":9.7622,"speed":38,"cap":52,"battery":12}
// {"type":"POSITION","imei":"358000000000821","ts":"2026-07-03T10:05:00Z","lat":3.7960,"lon":9.9100,"speed":0,"cap":0,"battery":65}

// Exemple utilisant `trackerId` (tel que renvoyé par le firmware corrigé)
// {"type":"POSITION","trackerId":"FCN-0733","ts":"2026-07-03T07:30:00Z","lat":4.0360,"lon":9.7622,"speed":38,"cap":52,"battery":12}
//
// Premiere transmission d'un traceur "sortie d'usine" (FCN-9001, voir v6) :
// {"type":"POSITION","trackerId":"FCN-9001","ts":"2026-07-10T09:00:00Z","lat":4.0511,"lon":9.7679,"speed":0,"cap":0,"battery":100,"acc":true}
//
// Exemple de webhook HTTP :
// POST /api/tracker/webhook?id=358000000000421&lat=4.0511&lon=9.7679&bat=84&spd=0&cap=0&ts=2026-07-03T09:55:00Z
// Exemple de SMS texte :
// NORMAL FCN-0733 Pos: 4.0360,9.7622 Bat:12%

main()
  .catch(e => { console.error('Seed échoué :', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
