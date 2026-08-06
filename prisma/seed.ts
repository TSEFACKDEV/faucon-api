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
// SEED DE PRODUCTION — 1 utilisateur réel + 1 traceur réel
// Aucune donnée fictive : positions, alarmes et rapports viendront
// uniquement du vrai firmware une fois qu'il enverra correctement.
//
// Compte admin conservé (celui qui existait déjà), numéro de téléphone
// mis à jour avec le vrai numéro.
// ═══════════════════════════════════════════════

const USER_NOM        = 'MAKA MAKA';
const USER_EMAIL      = 'admin@faucon.cm';
const USER_TELEPHONE  = '+237653360437';
const USER_MOTDEPASSE = 'Faucon2025!';

const TRACKER_ID = 'FCN-0733';

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

  // ─── UTILISATEUR RÉEL ─────────────────────────────────────────
  const hash = await bcrypt.hash(USER_MOTDEPASSE, 12);

  const user = await prisma.utilisateur.create({
    data: {
      userName:       USER_NOM,
      email:          USER_EMAIL,
      motDePasseHash: hash,
      telephone:      USER_TELEPHONE,
      role:           'ADMIN',
    },
  });

  console.log(`✓ Utilisateur créé : ${user.email}`);

  // ─── TRACEUR RÉEL — FCN-0733 (A9G) ────────────────────────────
  // Rattaché directement à l'utilisateur ci-dessus (pas de PIN à saisir
  // dans l'app) : c'est le seul traceur, le seul compte, prêt à recevoir
  // les vraies trames dès que le firmware envoie correctement.
  const vehicule = await prisma.vehicule.create({
    data: {
      trackerId:     TRACKER_ID,
      nom:            'Traceur FCN-0733',
      utilisateurId:  user.id,
      estActif:       true,
    },
  });

  console.log(`✓ Traceur créé : ${vehicule.trackerId} (rattaché à ${user.email})`);

  console.log('\n════════════════════════════════════════');
  console.log('  SEED TERMINÉ');
  console.log('════════════════════════════════════════');
  console.log(`  Connexion : ${USER_EMAIL} / ${USER_MOTDEPASSE}`);
  console.log(`  Traceur   : ${TRACKER_ID}`);
  console.log('════════════════════════════════════════\n');
}

main()
  .catch(e => { console.error('Seed échoué :', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
