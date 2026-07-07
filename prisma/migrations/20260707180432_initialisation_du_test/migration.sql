-- CreateEnum
CREATE TYPE "ModeFonctionnement" AS ENUM ('WORK', 'MOVE', 'STANDBY');

-- CreateEnum
CREATE TYPE "TypeAlarme" AS ENUM ('SORTIE_ZONE', 'VITESSE_EXCESSIVE', 'DECOLLEMENT_TRACEUR', 'NON_MOUVEMENT', 'BATTERIE_FAIBLE');

-- CreateEnum
CREATE TYPE "CanalNotification" AS ENUM ('SMS', 'PUSH', 'EMAIL');

-- CreateEnum
CREATE TYPE "StatutCommande" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT');

-- CreateTable
CREATE TABLE "utilisateurs" (
    "id" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "telephone" TEXT,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derniereConnexion" TIMESTAMP(3),

    CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "dateExpiration" TIMESTAMP(3) NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicules" (
    "id" TEXT NOT NULL,
    "imei" TEXT,
    "trackerId" TEXT,
    "nom" TEXT NOT NULL,
    "image" TEXT,
    "modeActuel" "ModeFonctionnement" NOT NULL DEFAULT 'MOVE',
    "niveauBatterie" INTEGER NOT NULL DEFAULT 100,
    "estActif" BOOLEAN NOT NULL DEFAULT true,
    "dateAjout" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derniereCommunication" TIMESTAMP(3),
    "utilisateurId" TEXT,

    CONSTRAINT "vehicules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" BIGSERIAL NOT NULL,
    "vehiculeId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "altitude" DOUBLE PRECISION,
    "vitesse" DOUBLE PRECISION NOT NULL,
    "cap" DOUBLE PRECISION NOT NULL,
    "nbSatellites" INTEGER,
    "hdop" DOUBLE PRECISION,
    "niveauBatterie" INTEGER NOT NULL,
    "statutACC" BOOLEAN NOT NULL,
    "cyc" INTEGER,
    "alr" INTEGER,
    "horodatage" TIMESTAMP(3) NOT NULL,
    "dateReception" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limites_vitesse" (
    "id" TEXT NOT NULL,
    "vehiculeId" TEXT NOT NULL,
    "seuilKmh" DOUBLE PRECISION NOT NULL,
    "estActive" BOOLEAN NOT NULL DEFAULT true,
    "dateModif" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "limites_vitesse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perimetres_geofence" (
    "id" TEXT NOT NULL,
    "vehiculeId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "centreLat" DOUBLE PRECISION NOT NULL,
    "centreLon" DOUBLE PRECISION NOT NULL,
    "rayonMetres" DOUBLE PRECISION NOT NULL,
    "estActif" BOOLEAN NOT NULL DEFAULT true,
    "dateModif" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perimetres_geofence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alarmes" (
    "id" TEXT NOT NULL,
    "vehiculeId" TEXT NOT NULL,
    "typeAlarme" "TypeAlarme" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "valeurMesuree" DOUBLE PRECISION,
    "seuilConfigure" DOUBLE PRECISION,
    "estAcquittee" BOOLEAN NOT NULL DEFAULT false,
    "dateAcquittement" TIMESTAMP(3),
    "horodatage" TIMESTAMP(3) NOT NULL,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alarmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "alarmeId" TEXT NOT NULL,
    "canal" "CanalNotification" NOT NULL,
    "contenu" TEXT NOT NULL,
    "estEnvoyee" BOOLEAN NOT NULL DEFAULT false,
    "dateEnvoi" TIMESTAMP(3),
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rapports_journaliers" (
    "id" TEXT NOT NULL,
    "vehiculeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "distanceTotaleKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vitesseMoyenne" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vitesseMax" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nbAlarmes" INTEGER NOT NULL DEFAULT 0,
    "tempsArretMinutes" INTEGER NOT NULL DEFAULT 0,
    "dateGeneration" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rapports_journaliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions_trajet" (
    "id" TEXT NOT NULL,
    "vehiculeId" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3),
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dureeMinutes" INTEGER,

    CONSTRAINT "sessions_trajet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commandes_descendantes" (
    "id" TEXT NOT NULL,
    "vehiculeId" TEXT NOT NULL,
    "codeCommande" TEXT NOT NULL,
    "parametres" JSONB,
    "statutExecution" "StatutCommande" NOT NULL DEFAULT 'PENDING',
    "dateEnvoi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateReponse" TIMESTAMP(3),

    CONSTRAINT "commandes_descendantes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_userName_key" ON "utilisateurs"("userName");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_email_key" ON "utilisateurs"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "vehicules_imei_key" ON "vehicules"("imei");

-- CreateIndex
CREATE UNIQUE INDEX "vehicules_trackerId_key" ON "vehicules"("trackerId");

-- CreateIndex
CREATE INDEX "vehicules_utilisateurId_idx" ON "vehicules"("utilisateurId");

-- CreateIndex
CREATE INDEX "positions_vehiculeId_horodatage_idx" ON "positions"("vehiculeId", "horodatage");

-- CreateIndex
CREATE UNIQUE INDEX "limites_vitesse_vehiculeId_key" ON "limites_vitesse"("vehiculeId");

-- CreateIndex
CREATE UNIQUE INDEX "perimetres_geofence_vehiculeId_key" ON "perimetres_geofence"("vehiculeId");

-- CreateIndex
CREATE INDEX "alarmes_vehiculeId_horodatage_idx" ON "alarmes"("vehiculeId", "horodatage");

-- CreateIndex
CREATE INDEX "alarmes_estAcquittee_idx" ON "alarmes"("estAcquittee");

-- CreateIndex
CREATE UNIQUE INDEX "rapports_journaliers_vehiculeId_date_key" ON "rapports_journaliers"("vehiculeId", "date");

-- CreateIndex
CREATE INDEX "sessions_trajet_vehiculeId_dateDebut_idx" ON "sessions_trajet"("vehiculeId", "dateDebut");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicules" ADD CONSTRAINT "vehicules_utilisateurId_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "utilisateurs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "vehicules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "limites_vitesse" ADD CONSTRAINT "limites_vitesse_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "vehicules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perimetres_geofence" ADD CONSTRAINT "perimetres_geofence_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "vehicules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alarmes" ADD CONSTRAINT "alarmes_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "vehicules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alarmeId_fkey" FOREIGN KEY ("alarmeId") REFERENCES "alarmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rapports_journaliers" ADD CONSTRAINT "rapports_journaliers_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "vehicules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions_trajet" ADD CONSTRAINT "sessions_trajet_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "vehicules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commandes_descendantes" ADD CONSTRAINT "commandes_descendantes_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "vehicules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
