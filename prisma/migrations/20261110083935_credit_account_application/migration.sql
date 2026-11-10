-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "companiesHouse" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "creditRequestedPence" INTEGER,
ADD COLUMN     "expectedDelegates" INTEGER,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "jobTitle" TEXT;
