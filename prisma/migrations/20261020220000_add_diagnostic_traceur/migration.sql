-- Diagnostic périodique du traceur (firmware v12.1).
--
-- Le firmware publie sur faucon/<trackerId>/diag un JSON de santé toutes
-- les 5 minutes : mode réellement appliqué, modèle, version, compteurs
-- de reset, état GPS, santé I2C, file d'attente du journal flash, mémoire
-- libre. Ces données n'existaient nulle part : la table les conserve pour
-- l'app (fiche véhicule) et pour le suivi de santé des unités.
--
-- On garde le payload complet dans "brut" : le modèle ne peut pas suivre
-- tous les champs que le firmware pourra ajouter, et l'historique doit
-- rester faithful.
-- CreateTable
CREATE TABLE "diagnostics_traceurs" (
    "id" TEXT NOT NULL,
    "vehiculeId" TEXT NOT NULL,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    "modele" TEXT,
    "version" TEXT,
    "mode" TEXT,

    "causeReset" TEXT,
    "resetCode" INTEGER,
    "dernierArret" TEXT,
    "nbWatchdog" INTEGER NOT NULL DEFAULT 0,
    "nbBrownout" INTEGER NOT NULL DEFAULT 0,
    "nbPanique" INTEGER NOT NULL DEFAULT 0,

    "fixValide" BOOLEAN NOT NULL DEFAULT false,
    "fixPerime" BOOLEAN NOT NULL DEFAULT false,
    "ageFixSecondes" INTEGER,
    "satellites" INTEGER,
    "hdop" DOUBLE PRECISION,

    "batteriePct" INTEGER,
    "signalPct" INTEGER,
    "signalValide" BOOLEAN NOT NULL DEFAULT false,

    "i2cRecuperations" INTEGER NOT NULL DEFAULT 0,
    "i2cSuspendu" BOOLEAN NOT NULL DEFAULT false,
    "journalOk" BOOLEAN NOT NULL DEFAULT false,
    "positionsPerdues" INTEGER NOT NULL DEFAULT 0,
    "fileNombre" INTEGER,
    "sourceHeure" TEXT,
    "heapLibre" INTEGER,

    "brut" JSONB,

    CONSTRAINT "diagnostics_traceurs_pkey" PRIMARY KEY ("id")
);

-- Foreign key
ALTER TABLE "diagnostics_traceurs" ADD CONSTRAINT "diagnostics_traceurs_vehiculeId_fkey" FOREIGN KEY ("vehiculeId") REFERENCES "vehicules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index
CREATE INDEX "diagnostics_traceurs_vehiculeId_horodatage_idx" ON "diagnostics_traceurs"("vehiculeId", "horodatage");
