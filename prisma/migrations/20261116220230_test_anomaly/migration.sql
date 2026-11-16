-- CreateTable
CREATE TABLE "TestAnomaly" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "field" TEXT,
    "value" TEXT,
    "detail" TEXT,
    "personId" TEXT,

    CONSTRAINT "TestAnomaly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TestAnomaly_createdAt_idx" ON "TestAnomaly"("createdAt");
