-- Identifiants MQTT uniques par traceur (générés au provisionnement).
--
-- Ils remplacent les credentials MQTT partagés (faucon_tracker/faucon) :
-- chaque traceur se connecte au broker avec son propre couple, ce qui
-- l'isole des topics des autres traceurs (un traceur compromis ne peut plus
-- publier ni s'abonner aux topics d'un autre boîtier).
--
-- Colonnes nullable : les traceurs déjà en base (et provisionnés avant ce
-- changement) n'ont pas de credentials individuels et conservent le
-- comportement historique.
-- AlterTable
ALTER TABLE "vehicules" ADD COLUMN "mqttUser" TEXT,
ADD COLUMN "mqttPassword" TEXT;
