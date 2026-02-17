-- AlterTable
ALTER TABLE "Deposit" ADD COLUMN     "imagePath" TEXT,
ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'Unknown',
ALTER COLUMN "proofFileId" DROP NOT NULL;
