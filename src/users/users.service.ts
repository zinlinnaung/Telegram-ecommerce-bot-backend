import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOrCreateUser(
    telegramId: number,
    firstName: string,
    username?: string,
  ) {
    return this.prisma.user.upsert({
      where: { telegramId },
      update: { firstName, username },
      create: { telegramId, firstName, username },
    });
  }

  async getBalance(telegramId: number) {
    const user = await this.prisma.user.findUnique({ where: { telegramId } });
    return user ? user.balance : 0;
  }

  async updateBalance(telegramId: number, amount: number) {
    return this.prisma.user.update({
      where: { telegramId: BigInt(telegramId) },
      data: {
        balance: {
          // decrement (နှုတ်ခြင်း) သို့မဟုတ် increment (ပေါင်းခြင်း) လုပ်ရန်
          increment: amount,
        },
      },
    });
  }
}
