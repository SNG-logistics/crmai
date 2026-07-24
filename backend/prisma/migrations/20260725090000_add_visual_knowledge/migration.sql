-- Add image + text knowledge sources while keeping existing Q&A rows compatible.
ALTER TABLE "KnowledgeBase" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'qa';
ALTER TABLE "KnowledgeBase" ADD COLUMN "sourceText" TEXT;
ALTER TABLE "KnowledgeBase" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "KnowledgeBase" ADD COLUMN "imageAnalysis" TEXT;

CREATE INDEX "KnowledgeBase_botConfigId_idx" ON "KnowledgeBase"("botConfigId");
