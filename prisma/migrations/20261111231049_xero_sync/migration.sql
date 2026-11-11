-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "accountsPhone" TEXT,
ADD COLUMN     "addresses" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "xeroContactId" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "xeroInvoiceId" TEXT,
ADD COLUMN     "xeroInvoiceNo" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "xeroPaymentId" TEXT;

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "xeroContactId" TEXT;

-- AlterTable
ALTER TABLE "Statement" ADD COLUMN     "xeroInvoiceId" TEXT;

-- CreateTable
CREATE TABLE "XeroJob" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "xeroId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "XeroJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "XeroJob_key_key" ON "XeroJob"("key");

-- CreateIndex
CREATE INDEX "XeroJob_status_nextAttemptAt_idx" ON "XeroJob"("status", "nextAttemptAt");
