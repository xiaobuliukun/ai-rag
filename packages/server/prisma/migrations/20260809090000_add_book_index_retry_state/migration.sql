-- AlterTable
ALTER TABLE "Book" ADD COLUMN "indexPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Book" ADD COLUMN "indexRevision" INTEGER NOT NULL DEFAULT 0;

-- Existing installations may already contain books whose database changes
-- committed before a failed index update. Force one retry after upgrading so
-- those previously untracked failures can heal on the next scan/rebuild.
UPDATE "Book" SET "indexPending" = true, "indexRevision" = 1;
