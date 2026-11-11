-- AlterEnum
ALTER TYPE "TaskType" ADD VALUE 'CANCELLATION_REVIEW';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "addedToId" TEXT,
ADD COLUMN     "cancellationChargePence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancellationDecidedAt" TIMESTAMP(3),
ADD COLUMN     "cancellationDecidedById" TEXT,
ADD COLUMN     "cancellationDecision" TEXT,
ADD COLUMN     "cancellationNote" TEXT,
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_addedToId_fkey" FOREIGN KEY ("addedToId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;
