-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "duration" INTEGER,
    "notes" TEXT,
    "depositedAfter" BOOLEAN NOT NULL DEFAULT false,
    "depositAmount" REAL,
    "scheduledAt" DATETIME,
    "calledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CallLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CallLog_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CallLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TelesalesTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "callTarget" INTEGER NOT NULL DEFAULT 100,
    "answerRateTarget" REAL NOT NULL DEFAULT 0.6,
    "depositRateTarget" REAL NOT NULL DEFAULT 0.3,
    "depositAmountTarget" REAL NOT NULL DEFAULT 50000,
    "profitTarget" REAL NOT NULL DEFAULT 20000,
    CONSTRAINT "TelesalesTarget_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TelesalesTarget_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "depositAmount" REAL NOT NULL DEFAULT 0,
    "withdrawAmount" REAL NOT NULL DEFAULT 0,
    "netProfit" REAL NOT NULL DEFAULT 0,
    "depositCount" INTEGER NOT NULL DEFAULT 0,
    "withdrawCount" INTEGER NOT NULL DEFAULT 0,
    "gameBreakdown" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "FinancialRecord_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "commission" REAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Partner_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "avatar" TEXT,
    "lineUserId" TEXT,
    "telegramId" TEXT,
    "webchatId" TEXT,
    "customFields" TEXT NOT NULL DEFAULT '{}',
    "leadScore" INTEGER NOT NULL DEFAULT 0,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "username" TEXT,
    "affiliateCode" TEXT,
    "memberType" TEXT NOT NULL DEFAULT 'new',
    "tsStatus" TEXT NOT NULL DEFAULT 'pending',
    "tsAssignedToId" TEXT,
    "registeredAt" DATETIME,
    "firstDepositAt" DATETIME,
    "lastDepositAt" DATETIME,
    "totalDeposit" REAL NOT NULL DEFAULT 0,
    "totalWithdraw" REAL NOT NULL DEFAULT 0,
    "totalProfit" REAL NOT NULL DEFAULT 0,
    "depositCount" INTEGER NOT NULL DEFAULT 0,
    "withdrawCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Contact" ("avatar", "createdAt", "customFields", "displayName", "email", "firstName", "id", "isBlocked", "lastName", "leadScore", "lineUserId", "notes", "phone", "telegramId", "tenantId", "updatedAt", "webchatId") SELECT "avatar", "createdAt", "customFields", "displayName", "email", "firstName", "id", "isBlocked", "lastName", "leadScore", "lineUserId", "notes", "phone", "telegramId", "tenantId", "updatedAt", "webchatId" FROM "Contact";
DROP TABLE "Contact";
ALTER TABLE "new_Contact" RENAME TO "Contact";
CREATE UNIQUE INDEX "Contact_tenantId_lineUserId_key" ON "Contact"("tenantId", "lineUserId");
CREATE UNIQUE INDEX "Contact_tenantId_telegramId_key" ON "Contact"("tenantId", "telegramId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "TelesalesTarget_tenantId_agentId_period_key" ON "TelesalesTarget"("tenantId", "agentId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialRecord_tenantId_contactId_date_key" ON "FinancialRecord"("tenantId", "contactId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_tenantId_code_key" ON "Partner"("tenantId", "code");
