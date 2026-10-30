-- Clés API client : lecture seule, limitées aux véhicules de l'utilisateur.
CREATE TABLE "cles_api" (
    "id" TEXT NOT NULL,
    "utilisateurId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY['owner:read']::TEXT[],
    "estActive" BOOLEAN NOT NULL DEFAULT true,
    "dateCreation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "derniereUtilisation" TIMESTAMP(3),
    "dateExpiration" TIMESTAMP(3),

    CONSTRAINT "cles_api_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cles_api_hash_key" ON "cles_api"("hash");
CREATE INDEX "cles_api_utilisateurId_idx" ON "cles_api"("utilisateurId");

ALTER TABLE "cles_api" ADD CONSTRAINT "cles_api_utilisateurId_fkey"
FOREIGN KEY ("utilisateurId") REFERENCES "utilisateurs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
