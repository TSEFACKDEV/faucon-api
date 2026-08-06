-- CreateEnum
CREATE TYPE "Role" AS ENUM ('UTILISATEUR', 'ADMIN');

-- AlterTable
ALTER TABLE "utilisateurs" ADD COLUMN     "role" "Role" NOT NULL DEFAULT 'UTILISATEUR';
