-- État du support Hall du traceur (collé / décollé)
ALTER TABLE "vehicules" ADD COLUMN "estColle" BOOLEAN;
ALTER TABLE "positions" ADD COLUMN "colle" BOOLEAN;
