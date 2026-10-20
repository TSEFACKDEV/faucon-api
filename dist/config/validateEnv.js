"use strict";
// Doit être importé en tout premier dans server.ts (juste après
// 'dotenv/config') : les imports ES sont hissés et évalués avant le reste du
// fichier, donc toute variable requise par un module importé plus bas (ex.
// config/database.ts, qui construit le client Prisma dès son chargement)
// doit être validée avant que ces imports ne s'exécutent — sinon l'échec
// n'apparaît que tardivement, à la première requête qui touche la base, avec
// un message Prisma cryptique plutôt qu'un arrêt net au démarrage.
for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'DATABASE_URL']) {
    if (!process.env[key]) {
        throw new Error(`Variable d'environnement ${key} manquante — arrêt du serveur.`);
    }
}
// COMMAND_SIGNING_KEY est requise en production pour la signature HMAC des
// commandes descendantes. En développement, l'absence de cette clé désactive
// silencieusement la vérification (les commandes sont acceptées sans
// signature) — pratique pour les tests, dangereux en prod.
if (process.env.NODE_ENV === 'production' && !process.env.COMMAND_SIGNING_KEY) {
    console.error('╔═══════════════════════════════════════════════════════════════╗');
    console.error('║  [SECURITY] COMMAND_SIGNING_KEY absente — commandes NON      ║');
    console.error('║  signées en production. Tout subscriber MQTT malveillant     ║');
    console.error('║  peut injecter des commandes aux traceurs.                    ║');
    console.error('╚═══════════════════════════════════════════════════════════════╝');
}
