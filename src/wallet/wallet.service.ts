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

  // ✅ Add this new method
  // src/wallet/wallet.service.ts

  async createDepositFromWebApp(dto: {
    telegramId: string;
    amount: number;
    method: string;
    proofFileId: string; // ✅ We now store the Telegram ID
  }) {
    const user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(dto.telegramId) },
    });

    if (!user) throw new Error('User not found');

    return await this.prisma.deposit.create({
      data: {
        userId: user.id,
        amount: dto.amount,
        method: dto.method,
        proofFileId: dto.proofFileId, // ✅ Unified storage
        status: 'PENDING',
      },
      include: {
        user: true,
      },
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
