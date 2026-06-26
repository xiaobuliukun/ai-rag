-- AlterTable
ALTER TABLE "AiConfig" ADD COLUMN "embeddingProvider" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "AiConfig" ADD COLUMN "embeddingModel" TEXT;
