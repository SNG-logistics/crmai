-- CreateTable
CREATE TABLE "SlipVerification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "slipokSuccess" BOOLEAN,
    "transRef" TEXT,
    "sendingBank" TEXT,
    "receivingBank" TEXT,
    "amount" REAL,
    "transDate" TEXT,
    "transTime" TEXT,
    "senderName" TEXT,
    "receiverName" TEXT,
    "aiSuccess" BOOLEAN,
    "aiAmount" REAL,
    "aiBankFrom" TEXT,
    "aiBankTo" TEXT,
    "aiTransDate" TEXT,
    "aiConfidence" TEXT,
    "aiSuspicious" BOOLEAN NOT NULL DEFAULT false,
    "aiReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedBy" TEXT NOT NULL DEFAULT 'auto',
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateOfId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SlipVerification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BotConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "systemPrompt" TEXT NOT NULL DEFAULT 'You are a helpful customer service assistant.',
    "model" TEXT NOT NULL DEFAULT 'gpt-4o',
    "temperature" REAL NOT NULL DEFAULT 0.7,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BotConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BotConfig" ("createdAt", "id", "isActive", "model", "name", "systemPrompt", "temperature", "tenantId", "updatedAt") SELECT "createdAt", "id", "isActive", "model", "name", "systemPrompt", "temperature", "tenantId", "updatedAt" FROM "BotConfig";
DROP TABLE "BotConfig";
ALTER TABLE "new_BotConfig" RENAME TO "BotConfig";
CREATE UNIQUE INDEX "BotConfig_tenantId_key" ON "BotConfig"("tenantId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SlipVerification_tenantId_idx" ON "SlipVerification"("tenantId");

-- CreateIndex
CREATE INDEX "SlipVerification_imageHash_idx" ON "SlipVerification"("imageHash");

-- CreateIndex
CREATE INDEX "SlipVerification_transRef_idx" ON "SlipVerification"("transRef");
