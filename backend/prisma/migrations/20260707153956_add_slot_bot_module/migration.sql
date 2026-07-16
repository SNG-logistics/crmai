-- CreateTable
CREATE TABLE "SlotProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SlotProvider_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SlotGame" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "imageUrl" TEXT,
    "description" TEXT,
    "playUrl" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "popularityScore" INTEGER NOT NULL DEFAULT 0,
    "bonusScore" INTEGER NOT NULL DEFAULT 0,
    "featureScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SlotGame_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "SlotProvider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SlotEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "contactId" TEXT,
    "gameId" TEXT,
    "providerId" TEXT,
    "campaignSource" TEXT,
    "eventType" TEXT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SlotEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "SlotGame" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SlotLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "displayName" TEXT,
    "username" TEXT,
    "contactId" TEXT,
    "consentStatus" TEXT NOT NULL DEFAULT 'OPTED_IN',
    "campaignSource" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "lastActiveAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SlotLead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "SlotProvider_tenantId_idx" ON "SlotProvider"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotProvider_tenantId_code_key" ON "SlotProvider"("tenantId", "code");

-- CreateIndex
CREATE INDEX "SlotGame_tenantId_idx" ON "SlotGame"("tenantId");

-- CreateIndex
CREATE INDEX "SlotGame_providerId_idx" ON "SlotGame"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotGame_tenantId_slug_key" ON "SlotGame"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "SlotEvent_tenantId_idx" ON "SlotEvent"("tenantId");

-- CreateIndex
CREATE INDEX "SlotEvent_telegramUserId_idx" ON "SlotEvent"("telegramUserId");

-- CreateIndex
CREATE INDEX "SlotEvent_gameId_idx" ON "SlotEvent"("gameId");

-- CreateIndex
CREATE INDEX "SlotEvent_eventType_idx" ON "SlotEvent"("eventType");

-- CreateIndex
CREATE INDEX "SlotLead_tenantId_idx" ON "SlotLead"("tenantId");

-- CreateIndex
CREATE INDEX "SlotLead_consentStatus_idx" ON "SlotLead"("consentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SlotLead_tenantId_telegramId_key" ON "SlotLead"("tenantId", "telegramId");
