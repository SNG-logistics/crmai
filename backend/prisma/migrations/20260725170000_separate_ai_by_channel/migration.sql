-- Keep all existing AI settings as LINE, then allow a separate config per channel.
ALTER TABLE "BotConfig" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'line';

DROP INDEX IF EXISTS "BotConfig_companyId_key";

CREATE UNIQUE INDEX "BotConfig_companyId_channel_key"
ON "BotConfig"("companyId", "channel");

CREATE INDEX "BotConfig_tenantId_channel_idx"
ON "BotConfig"("tenantId", "channel");

-- Start WhatsApp with a snapshot of today's LINE settings. From this migration
-- onward they are two independent rows.
INSERT INTO "BotConfig" (
  "id", "tenantId", "companyId", "channel", "name", "isActive",
  "systemPrompt", "model", "temperature", "metadata", "createdAt", "updatedAt"
)
SELECT
  'wa_' || lower(hex(randomblob(12))),
  "tenantId", "companyId", 'whatsapp', 'AI WhatsApp', "isActive",
  "systemPrompt", "model", "temperature", "metadata", "createdAt", CURRENT_TIMESTAMP
FROM "BotConfig"
WHERE "channel" = 'line' AND "companyId" IS NOT NULL;

-- Snapshot each existing knowledge item into the matching WhatsApp config.
INSERT INTO "KnowledgeBase" (
  "id", "botConfigId", "question", "answer", "category", "sourceType",
  "sourceText", "imageUrl", "imagePreviewUrl", "imageAnalysis",
  "sendImage", "isActive", "createdAt", "updatedAt"
)
SELECT
  'wakb_' || lower(hex(randomblob(12))),
  destination."id",
  knowledge."question", knowledge."answer", knowledge."category", knowledge."sourceType",
  knowledge."sourceText", knowledge."imageUrl", knowledge."imagePreviewUrl", knowledge."imageAnalysis",
  knowledge."sendImage", knowledge."isActive", knowledge."createdAt", CURRENT_TIMESTAMP
FROM "KnowledgeBase" AS knowledge
JOIN "BotConfig" AS source ON source."id" = knowledge."botConfigId" AND source."channel" = 'line'
JOIN "BotConfig" AS destination
  ON destination."companyId" = source."companyId" AND destination."channel" = 'whatsapp';
