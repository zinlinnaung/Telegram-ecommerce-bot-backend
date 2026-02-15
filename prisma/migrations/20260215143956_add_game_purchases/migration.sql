-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "type" "ProductType" NOT NULL DEFAULT 'AUTO';

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "playerId" TEXT,
ADD COLUMN     "serverId" TEXT,
ADD COLUMN     "status" "PurchaseStatus" NOT NULL DEFAULT 'COMPLETED';
