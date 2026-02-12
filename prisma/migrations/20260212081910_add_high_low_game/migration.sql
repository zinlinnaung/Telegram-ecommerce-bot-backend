-- CreateEnum
CREATE TYPE "HighLowChoice" AS ENUM ('HIGH', 'LOW');

-- CreateEnum
CREATE TYPE "HighLowStatus" AS ENUM ('PENDING', 'WIN', 'LOSE');

-- CreateTable
CREATE TABLE "HighLowBet" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "choice" "HighLowChoice" NOT NULL,
    "resultNum" INTEGER,
    "payout" DECIMAL(10,2),
    "status" "HighLowStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HighLowBet_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "HighLowBet" ADD CONSTRAINT "HighLowBet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
