-- Staff and trainers sign in with the authenticator app alone, so wrong codes are counted and lock the sign-in for a while.
ALTER TABLE "Person" ADD COLUMN "totpFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "totpLockedUntil" TIMESTAMP(3);
