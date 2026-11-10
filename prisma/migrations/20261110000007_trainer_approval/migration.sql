-- CreateEnum
CREATE TYPE "TrainerStatus" AS ENUM ('PENDING', 'APPROVED', 'SUSPENDED');

-- AlterTable
ALTER TABLE "TrainerProfile" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "employment" TEXT,
ADD COLUMN     "status" "TrainerStatus" NOT NULL DEFAULT 'PENDING';
