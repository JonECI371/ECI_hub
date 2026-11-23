-- Who entered a delegate's registration for them, and when they confirmed they were authorised to.
ALTER TABLE "Registration" ADD COLUMN "enteredById" TEXT,
ADD COLUMN "authorityAt" TIMESTAMP(3);
