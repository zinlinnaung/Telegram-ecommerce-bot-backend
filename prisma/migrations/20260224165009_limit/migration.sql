-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "packageDays" INTEGER DEFAULT 30,
ADD COLUMN     "usageLimitGB" INTEGER DEFAULT 0;
