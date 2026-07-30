-- AlterTable
ALTER TABLE "SavedKeyword" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
