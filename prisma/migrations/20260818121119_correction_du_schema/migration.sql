/*
  Warnings:

  - You are about to drop the `notifications` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `sessions_trajet` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_alarmeId_fkey";

-- DropForeignKey
ALTER TABLE "sessions_trajet" DROP CONSTRAINT "sessions_trajet_vehiculeId_fkey";

-- DropTable
DROP TABLE "notifications";

-- DropTable
DROP TABLE "sessions_trajet";

-- DropEnum
DROP TYPE "CanalNotification";
