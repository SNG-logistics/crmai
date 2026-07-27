-- AlterTable
ALTER TABLE "SlipVerification" ADD COLUMN "companyId" TEXT;
ALTER TABLE "SlipVerification" ADD COLUMN "normalizedTransRef" TEXT;
ALTER TABLE "SlipVerification" ADD COLUMN "currency" TEXT;
ALTER TABLE "SlipVerification" ADD COLUMN "aiTransTime" TEXT;
ALTER TABLE "SlipVerification" ADD COLUMN "bankMatchConfidence" TEXT;
ALTER TABLE "SlipVerification" ADD COLUMN "bankMatchReason" TEXT;
ALTER TABLE "SlipVerification" ADD COLUMN "bankMatchedAt" DATETIME;

-- Backfill historical slips from their conversation. Older conversations that
-- predate company scoping use the tenant's first company, matching the CRM's
-- existing default-company behavior.
UPDATE "SlipVerification"
SET "companyId" = COALESCE(
    (SELECT "companyId" FROM "Conversation" WHERE "Conversation"."id" = "SlipVerification"."conversationId"),
    (SELECT "id" FROM "Company" WHERE "Company"."tenantId" = "SlipVerification"."tenantId" ORDER BY "createdAt" ASC LIMIT 1)
)
WHERE "companyId" IS NULL;

-- CreateTable
CREATE TABLE "BankCaptureDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "allowedPackages" TEXT NOT NULL DEFAULT '[]',
    "signerPins" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankCaptureDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankCaptureDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "eventId" TEXT NOT NULL,
    "notificationKeyHash" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "signerSha256" TEXT,
    "appVersion" TEXT,
    "bankHint" TEXT,
    "direction" TEXT NOT NULL,
    "amountMinor" TEXT,
    "amountDisplay" TEXT,
    "currency" TEXT,
    "transRef" TEXT,
    "accountSuffix" TEXT,
    "senderName" TEXT,
    "postedAt" DATETIME NOT NULL,
    "capturedAt" DATETIME NOT NULL,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentHash" TEXT NOT NULL,
    "rawPayloadEncrypted" TEXT,
    "parseConfidence" TEXT NOT NULL DEFAULT 'low',
    "status" TEXT NOT NULL DEFAULT 'received',
    "matchReason" TEXT,
    "matchedSlipId" TEXT,
    CONSTRAINT "BankNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankNotification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankNotification_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BankCaptureDevice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankNotification_matchedSlipId_fkey" FOREIGN KEY ("matchedSlipId") REFERENCES "SlipVerification" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankRequestNonce" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankRequestNonce_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankRequestNonce_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BankCaptureDevice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BankCaptureDevice_publicId_key" ON "BankCaptureDevice"("publicId");
CREATE INDEX "BankCaptureDevice_tenantId_companyId_idx" ON "BankCaptureDevice"("tenantId", "companyId");
CREATE UNIQUE INDEX "BankNotification_deviceId_eventId_key" ON "BankNotification"("deviceId", "eventId");
CREATE UNIQUE INDEX "BankNotification_matchedSlipId_key" ON "BankNotification"("matchedSlipId");
CREATE INDEX "BankNotification_tenantId_companyId_receivedAt_idx" ON "BankNotification"("tenantId", "companyId", "receivedAt");
CREATE INDEX "BankNotification_tenantId_companyId_transRef_idx" ON "BankNotification"("tenantId", "companyId", "transRef");
CREATE INDEX "BankNotification_tenantId_companyId_amountMinor_currency_idx" ON "BankNotification"("tenantId", "companyId", "amountMinor", "currency");
CREATE UNIQUE INDEX "BankRequestNonce_deviceId_nonce_key" ON "BankRequestNonce"("deviceId", "nonce");
CREATE INDEX "BankRequestNonce_createdAt_idx" ON "BankRequestNonce"("createdAt");
CREATE INDEX "SlipVerification_tenantId_companyId_idx" ON "SlipVerification"("tenantId", "companyId");
CREATE INDEX "SlipVerification_tenantId_companyId_normalizedTransRef_idx" ON "SlipVerification"("tenantId", "companyId", "normalizedTransRef");
