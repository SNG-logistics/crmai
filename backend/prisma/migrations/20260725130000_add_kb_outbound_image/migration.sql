-- Let visual knowledge send its source image together with the AI reply.
ALTER TABLE "KnowledgeBase" ADD COLUMN "imagePreviewUrl" TEXT;
ALTER TABLE "KnowledgeBase" ADD COLUMN "sendImage" BOOLEAN NOT NULL DEFAULT true;
