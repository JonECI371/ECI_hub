-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('ELEARNING', 'VIRTUAL_CLASSROOM', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "CourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'FULL', 'RUNNING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MeetingPlatform" AS ENUM ('TEAMS', 'ZOOM');

-- CreateEnum
CREATE TYPE "ElearningFulfilment" AS ENUM ('ADMIN_TASK', 'EMAIL_PROVIDER', 'API', 'SCORM');

-- CreateEnum
CREATE TYPE "VenueRelease" AS ENUM ('ON_CONFIRMATION', 'AFTER_APPROVAL');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DELEGATE', 'BOOKER', 'TRAINER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('APPLIED', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'DECLINED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('MAIN_BOOKER', 'BOOKER');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CARD', 'ACCOUNT');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PAYMENT_PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendeeStatus" AS ENUM ('DETAILS_MISSING', 'INVITED', 'REGISTERED', 'APPROVED', 'ATTENDED', 'NO_SHOW', 'CERTIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "StatementStatus" AS ENUM ('OPEN', 'ISSUED', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('ELEARNING_ENROLMENT', 'REGISTRATION_APPROVAL', 'CERTIFICATE_UPLOAD', 'DATE_CHANGE', 'ACCOUNT_APPLICATION', 'BOOKER_APPROVAL', 'MONTH_END_BILLING', 'EMAIL_BOUNCE', 'INTEGRATION_FAILURE');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'DISMISSED');

-- CreateTable
CREATE TABLE "Subject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL DEFAULT true,
    "placesLeftDisplay" TEXT NOT NULL DEFAULT 'WHEN_LOW',
    "changeCutoffHours" INTEGER NOT NULL DEFAULT 24,
    "registrationSet" TEXT NOT NULL DEFAULT 'default',
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "deliveryType" "DeliveryType" NOT NULL,
    "status" "CourseStatus" NOT NULL DEFAULT 'DRAFT',
    "shortDescription" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "durationText" TEXT NOT NULL,
    "pricePence" INTEGER NOT NULL,
    "vatRatePercent" INTEGER NOT NULL DEFAULT 20,
    "placesPerSession" INTEGER,
    "validityYears" INTEGER,
    "accreditation" TEXT,
    "photoUrl" TEXT,
    "photoAlt" TEXT,
    "faqs" JSONB NOT NULL DEFAULT '[]',
    "meetingPlatform" "MeetingPlatform",
    "meetingHost" TEXT,
    "defaultVenueId" TEXT,
    "venueRelease" "VenueRelease" NOT NULL DEFAULT 'ON_CONFIRMATION',
    "provider" TEXT,
    "fulfilment" "ElearningFulfilment",
    "providerEmail" TEXT,
    "daysToComplete" INTEGER,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "socialImageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "directions" TEXT,
    "isClientSite" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT',
    "venueId" TEXT,
    "trainerId" TEXT,
    "meetingId" TEXT,
    "joinUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "mobile" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "employer" TEXT,
    "schemeIds" JSONB NOT NULL DEFAULT '{}',
    "roles" "Role"[] DEFAULT ARRAY['DELEGATE']::"Role"[],
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "totpSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginCode" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyNumber" TEXT NOT NULL,
    "vatNumber" TEXT,
    "registeredAddress" TEXT NOT NULL,
    "invoiceAddress" TEXT,
    "accountsName" TEXT NOT NULL,
    "accountsEmail" TEXT NOT NULL,
    "creditLimitPence" INTEGER NOT NULL DEFAULT 0,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "poRule" TEXT NOT NULL DEFAULT 'NONE',
    "status" "AccountStatus" NOT NULL DEFAULT 'APPLIED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountMember" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'BOOKER',
    "status" "MemberStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',

    CONSTRAINT "AccountMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "bookerId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sessionId" TEXT,
    "accountId" TEXT,
    "places" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "poNumber" TEXT,
    "subtotalPence" INTEGER NOT NULL,
    "vatPence" INTEGER NOT NULL,
    "totalPence" INTEGER NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PAYMENT_PENDING',
    "holdExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attendee" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "personId" TEXT,
    "status" "AttendeeStatus" NOT NULL DEFAULT 'DETAILS_MISSING',

    CONSTRAINT "Attendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "fileKeys" TEXT[],
    "approval" "ApprovalStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrolment" (
    "id" TEXT NOT NULL,
    "attendeeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "packSentAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Enrolment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "places" INTEGER NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL,
    "offerToken" TEXT,
    "offerExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "stripeIntentId" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "refundedPence" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Statement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "status" "StatementStatus" NOT NULL DEFAULT 'OPEN',
    "xeroInvoiceNo" TEXT,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "netPence" INTEGER NOT NULL,
    "vatPence" INTEGER NOT NULL,

    CONSTRAINT "StatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "fileKey" TEXT,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainerProfile" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "subjects" TEXT[],
    "homeBase" TEXT,
    "qualifications" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "TrainerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "fromTime" TEXT NOT NULL,
    "toTime" TEXT NOT NULL,

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "assigneeId" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "pipeline" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "valuePence" INTEGER,
    "ownerId" TEXT,
    "notes" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "personId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_slug_key" ON "Subject"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Course_slug_key" ON "Course"("slug");

-- CreateIndex
CREATE INDEX "Session_startsAt_idx" ON "Session"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Person_email_key" ON "Person"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AccountMember_accountId_personId_key" ON "AccountMember"("accountId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_attendeeId_key" ON "Registration"("attendeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrolment_attendeeId_key" ON "Enrolment"("attendeeId");

-- CreateIndex
CREATE UNIQUE INDEX "WaitlistEntry_offerToken_key" ON "WaitlistEntry"("offerToken");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeIntentId_key" ON "Payment"("stripeIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Statement_accountId_month_key" ON "Statement"("accountId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "TrainerProfile_personId_key" ON "TrainerProfile"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_personId_date_key" ON "Availability"("personId", "date");

-- CreateIndex
CREATE INDEX "Task_status_type_idx" ON "Task"("status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_trigger_key" ON "EmailTemplate"("trigger");

-- CreateIndex
CREATE INDEX "AuditLog_recordType_recordId_idx" ON "AuditLog"("recordType", "recordId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_defaultVenueId_fkey" FOREIGN KEY ("defaultVenueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_trainerId_fkey" FOREIGN KEY ("trainerId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoginCode" ADD CONSTRAINT "LoginCode_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMember" ADD CONSTRAINT "AccountMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountMember" ADD CONSTRAINT "AccountMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_bookerId_fkey" FOREIGN KEY ("bookerId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendee" ADD CONSTRAINT "Attendee_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrolment" ADD CONSTRAINT "Enrolment_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "Attendee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementLine" ADD CONSTRAINT "StatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "Statement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementLine" ADD CONSTRAINT "StatementLine_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainerProfile" ADD CONSTRAINT "TrainerProfile_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
