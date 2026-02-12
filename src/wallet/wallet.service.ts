import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DepositStatus, TransactionType } from '@prisma/client';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService) {}

  async createDepositRequest(userId: number, amount: number, fileId: string) {
    return this.prisma.deposit.create({
      data: {
        userId,
        amount,
        proofFileId: fileId,
        status: DepositStatus.PENDING,
      },
    });
  }

  // src/wallet/wallet.service.ts

  // Ensure the signature has BOTH arguments
  async approveDeposit(depositId: number, adminId: number) {
    return this.prisma.$transaction(async (tx) => {
      const deposit = await tx.deposit.findUnique({
        where: { id: depositId },
        include: { user: true },
      });

      if (!deposit || deposit.status !== 'PENDING') {
        throw new Error('Invalid or already processed deposit');
      }

      // You can now log WHICH admin approved it if you want
      await tx.deposit.update({
        where: { id: depositId },
        data: { status: 'APPROVED' },
      });

      await tx.user.update({
        where: { id: deposit.userId },
        data: { balance: { increment: deposit.amount } },
      });

      return deposit;
    });
  }

  async rejectDeposit(depositId: number) {
    return this.prisma.deposit.update({
      where: { id: depositId },
      data: { status: DepositStatus.REJECTED },
      include: { user: true },
    });
  }
}
