import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DepositStatus, WithdrawStatus } from '@prisma/client';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { BotContext } from '../interfaces/bot-context.interface';

@Injectable()
export class WithdrawService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectBot() private readonly bot: Telegraf<BotContext>,
  ) {}

  async approveWithdraw(id: number) {
    const request = await this.prisma.withdraw.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!request || request.status !== WithdrawStatus.PENDING) {
      throw new BadRequestException(
        'တောင်းဆိုမှု မရှိတော့ပါ သို့မဟုတ် အတည်ပြုပြီးသား ဖြစ်နေသည်။',
      );
    }

    // 1. Database Update
    const updated = await this.prisma.withdraw.update({
      where: { id },
      data: { status: WithdrawStatus.APPROVED },
      include: { user: true },
    });

    // 2. Telegram Notification
    const message = `✅ <b>ငွေထုတ်ယူမှု အောင်မြင်ပါသည်</b>\n\n💰 ပမာဏ: <b>${request.amount.toLocaleString()} MMK</b>\n🏦 နည်းလမ်း: <b>${request.method}</b>\n\nလူကြီးမင်း၏ အကောင့်ထဲသို့ ငွေလွှဲပေးပြီးပါပြီ။ ကျေးဇူးတင်ပါသည်။`;

    await this.sendTelegramNotification(
      request.user.telegramId.toString(),
      message,
    );

    return updated;
  }

  async rejectWithdraw(id: number) {
    const request = await this.prisma.withdraw.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!request || request.status !== WithdrawStatus.PENDING) {
      throw new BadRequestException(
        'တောင်းဆိုမှု မရှိတော့ပါ သို့မဟုတ် အတည်ပြုပြီးသား ဖြစ်နေသည်။',
      );
    }

    // Refund and Status Update in Transaction
    const [_, updatedWithdraw] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: request.userId },
        data: { balance: { increment: request.amount } },
      }),
      this.prisma.withdraw.update({
        where: { id },
        data: { status: WithdrawStatus.REJECTED },
        include: { user: true },
      }),
    ]);

    const message = `❌ <b>ငွေထုတ်ယူမှု ပယ်ဖျက်ခံရပါသည်</b>\n\nလူကြီးမင်း ထုတ်ယူလိုသော <b>${request.amount.toLocaleString()} MMK</b> ကို လက်ကျန်ငွေထဲသို့ ပြန်လည်ထည့်သွင်းပေးထားပါသည်။`;

    await this.sendTelegramNotification(
      request.user.telegramId.toString(),
      message,
    );

    return updatedWithdraw;
  }

  private async sendTelegramNotification(telegramId: string, message: string) {
    try {
      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'HTML',
      });
    } catch (e: any) {
      console.error('Notification Error:', e.message);
    }
  }

  async approveDeposit(id: number) {
    const deposit = await this.prisma.deposit.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!deposit || deposit.status !== 'PENDING')
      throw new Error('Request not found');

    const updated = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: deposit.userId },
        data: { balance: { increment: deposit.amount } },
      }),
      this.prisma.deposit.update({
        where: { id },
        data: { status: DepositStatus.APPROVED },
        include: { user: true },
      }),
    ]);

    // User ဆီ Notification ပို့ခြင်း
    await this.bot.telegram.sendMessage(
      deposit.user.telegramId.toString(),
      `✅ <b>ငွေဖြည့်သွင်းမှု အောင်မြင်ပါသည်</b>\n\n💰 ပမာဏ: <b>${deposit.amount.toLocaleString()} MMK</b> ကို လက်ကျန်ငွေထဲ ပေါင်းထည့်ပေးလိုက်ပါပြီ။`,
      { parse_mode: 'HTML' },
    );

    return updated[1];
  }
}
