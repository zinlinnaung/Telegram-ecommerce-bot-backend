/*
  Warnings:

  - You are about to drop the column `imagePath` on the `Deposit` table. All the data in the column will be lost.
  - Made the column `proofFileId` on table `Deposit` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Deposit" DROP COLUMN "imagePath",
ALTER COLUMN "proofFileId" SET NOT NULL;
