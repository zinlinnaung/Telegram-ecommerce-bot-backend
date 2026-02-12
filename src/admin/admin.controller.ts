import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  BadRequestException,
  Body,
  Delete,
  Put,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { BotContext } from 'src/interfaces/bot-context.interface';
import { WithdrawService } from 'src/wallet/withdraw.service';
import { WithdrawStatus } from '@prisma/client';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectBot() private readonly bot: Telegraf<BotContext>,
    private readonly withdrawService: WithdrawService,
  ) {}

  @Post('products')
  async createProduct(
    @Body()
    body: {
      name: string;
      category: string;
      description?: string;
      price: number;
    },
  ) {
    return this.prisma.product.create({
      data: {
        name: body.name,
        category: body.category,
        description: body.description,
        price: body.price,
      },
    });
  }

  // 2. Update Product
  @Put('products/:id')
  async updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      category?: string;
      description?: string;
      price?: number;
    },
  ) {
    return this.prisma.product.update({
      where: { id },
      data: {
        name: body.name,
        category: body.category,
        description: body.description,
        price: body.price,
      },
    });
  }

  // 3. Delete Product
  @Delete('products/:id')
  async deleteProduct(@Param('id', ParseIntPipe) id: number) {
    // Note: Foreign key constraint ရှိလျှင် Keys များကို အရင်ဖျက်ရပါမည်
    // သို့သော် Prisma relation တွင် onDelete: Cascade မပါလျှင် manual ဖျက်ရမည်

    // Linked Keys များကို အရင်ဖျက်ခြင်း
    await this.prisma.productKey.deleteMany({
      where: { productId: id },
    });

    return this.prisma.product.delete({
      where: { id },
    });
  }

  // 4. Add Keys (Inventory) to Product
  @Post('products/:id/keys')
  async addProductKey(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { key: string },
  ) {
    return this.prisma.productKey.create({
      data: {
        key: body.key,
        productId: id,
        isUsed: false,
      },
    });
  }

  @Get('dashboard-stats')
  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      userCount,
      pendingDeps,
      pendingWiths,
      todayPurchases,
      todayWithdrawals,
      todayApprovedDeposits, // ထပ်တိုး- အတည်ပြုပြီးသား ငွေဖြည့်သွင်းမှုများ
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.deposit.findMany({
        where: { status: 'PENDING' },
        include: { user: true },
      }),
      this.prisma.withdraw.findMany({
        where: { status: 'PENDING' },
        include: { user: true },
      }),

      // ၁။ Product ဝယ်ယူမှုများ (အရောင်းရငွေ)
      this.prisma.purchase.aggregate({
        where: { createdAt: { gte: today } },
        _sum: { amount: true },
      }),

      // ၂။ ထုတ်ယူငွေ (APPROVED ဖြစ်ပြီးသား)
      this.prisma.withdraw.aggregate({
        where: { status: 'APPROVED', updatedAt: { gte: today } },
        _sum: { amount: true },
      }),

      // 💡 ၃။ ငွေဖြည့်သွင်းမှု (APPROVED ဖြစ်ပြီးသား) - ဤအချက်က Income ဖြစ်စေသည်
      this.prisma.deposit.aggregate({
        where: { status: 'APPROVED', updatedAt: { gte: today } },
        _sum: { amount: true },
      }),
    ]);

    // တွက်ချက်ခြင်း
    const purchaseRevenue = Number(todayPurchases._sum.amount || 0);
    const depositIncome = Number(todayApprovedDeposits._sum.amount || 0);
    const expense = Number(todayWithdrawals._sum.amount || 0);

    // 💡 စုစုပေါင်းဝင်ငွေ = အရောင်းရငွေ + ငွေဖြည့်သွင်းမှု
    const totalRevenue = purchaseRevenue + depositIncome;
    const netProfit = totalRevenue - expense;

    return {
      userCount,
      deposits: pendingDeps,
      withdrawals: pendingWiths,
      todayRevenue: totalRevenue, // စုစုပေါင်းဝင်ငွေ
      todayPurchase: purchaseRevenue, // အရောင်းသီးသန့်
      todayDeposit: depositIncome, // ငွေဖြည့်သွင်းမှုသီးသန့်
      todayWithdraw: expense,
      netProfit: netProfit,
    };
  }
  @Get('products')
  async getAllProducts() {
    return this.prisma.product.findMany({
      include: { keys: true },
    });
  }

  @Get('users')
  async getAllUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('toggle-topup')
  async toggleTopUp(@Body() body: { status: boolean }) {
    await this.prisma.systemSetting.upsert({
      where: { key: 'isTopUpOpen' },
      update: { value: body.status.toString() },
      create: { key: 'isTopUpOpen', value: body.status.toString() },
    });
    return { success: true, status: body.status };
  }

  @Get('users/:id')
  async getUserDetails(@Param('id', ParseIntPipe) id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        // နောက်ဆုံး ငွေသွင်းမှု ၁၀ ကြိမ်
        deposits: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        // နောက်ဆုံး ငွေထုတ်မှု ၁၀ ကြိမ်
        withdraws: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        // နောက်ဆုံး ထိုးသားမှု ၂၀ ကြိမ်
        bets: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        // ဝယ်ယူမှုမှတ်တမ်းများ
        purchases: {
          include: { product: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!user) throw new BadRequestException('User not found');

    // စုစုပေါင်း ငွေသွင်း/ငွေထုတ် ပမာဏများကို တွက်ချက်ခြင်း (Optional)
    const totalDeposit = user.deposits
      .filter((d) => d.status === 'APPROVED')
      .reduce((acc, curr) => acc + Number(curr.amount), 0);

    const totalWithdraw = user.withdraws
      .filter((w) => w.status === 'APPROVED')
      .reduce((acc, curr) => acc + Number(curr.amount), 0);

    return { ...user, totalDeposit, totalWithdraw };
  }

  @Get('get-image-url/:fileId')
  async getImageUrl(@Param('fileId') fileId: string) {
    try {
      const file = await this.bot.telegram.getFile(fileId);
      const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
      return { url };
    } catch (error) {
      throw new BadRequestException('Failed to get image from Telegram');
    }
  }

  @Post('approve-withdraw/:id')
  async approve(@Param('id', ParseIntPipe) id: number) {
    // 1. အရင်ဆုံး status ကို DB မှာ approve လုပ်ပါတယ်
    await this.withdrawService.approveWithdraw(id);

    // 2. Database ထဲက အချက်အလက်ကို ပြန်ဆွဲထုတ်ပြီး Telegram Message ID ရှိမရှိ စစ်ပါတယ်
    const record = await this.prisma.withdraw.findUnique({
      where: { id },
      include: { user: true },
    });

    // 3. Message ID ရှိခဲ့ရင် Bot ထဲက Message ကို Edit လုပ်ပါမယ်
    if (record && record.adminMessageId) {
      try {
        await this.bot.telegram.editMessageText(
          process.env.ADMIN_ID, // Bot Admin ရဲ့ Chat ID
          parseInt(record.adminMessageId),
          undefined, // inline_message_id
          `✅ <b>Approved via Dashboard</b>\n\n` +
            `👤 User: <b>${record.user.firstName || 'User'}</b>\n` +
            `💰 Amount: <b>${record.amount.toLocaleString()} MMK</b>\n` +
            `🏦 Method: <b>${record.method}</b>\n` +
            `📱 Phone: <code>${record.phoneNumber}</code>\n\n` +
            `✨ <i>Admin Panel မှတစ်ဆင့် အတည်ပြုပြီးပါပြီ။</i>`,
          { parse_mode: 'HTML' },
        );
      } catch (error: any) {
        console.error('Telegram Edit Error:', error.message);
        // Message က Admin ဘက်မှာ ဖျက်လိုက်တာမျိုးဆိုရင် Edit လို့မရလို့ Error တက်နိုင်ပါတယ်
      }
    }

    return { success: true };
  }

  @Post('reject-withdraw/:id')
  async reject(@Param('id', ParseIntPipe) id: number) {
    await this.withdrawService.rejectWithdraw(id);
    return { success: true };
  }

  @Post('approve-deposit/:id')
  async approveDep(@Param('id', ParseIntPipe) id: number) {
    return await this.withdrawService.approveDeposit(id);
  }

  @Post('reject-deposit/:id')
  async rejectDep(@Param('id', ParseIntPipe) id: number) {
    return await this.prisma.deposit.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
  }

  @Get('settings')
  async getSettings() {
    const settings = await this.prisma.systemSetting.findMany();
    // တန်ဖိုးများကို Object format ပြောင်းပေးခြင်း
    return settings.reduce(
      (acc, curr) => ({ ...acc, [curr.key]: curr.value }),
      {},
    );
  }

  @Post('update-settings')
  async updateSettings(
    @Body()
    settings: {
      winRatio: number;
      minBet: number;
      maxBet: number;
      payoutMultiplier: number;
    },
  ) {
    try {
      const updates = Object.entries(settings).map(([key, value]) => {
        return this.prisma.systemSetting.upsert({
          where: { key: key },
          update: { value: value.toString() },
          create: {
            key: key,
            value: value.toString(),
          },
        });
      });

      await Promise.all(updates);
      return { success: true, message: 'Settings updated successfully' };
    } catch (error) {
      console.error('Upsert Error:', error);
      throw new BadRequestException('Failed to update settings');
    }
  }

  @Post('settle-result')
  async settleResult(@Body() body: { type: '2D' | '3D'; winNumber: string }) {
    const { type, winNumber } = body;

    // ၁။ လက်ရှိ မြန်မာစံတော်ချိန် Session ကို သတ်မှတ်ခြင်း
    const now = new Date();
    const mmTime = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Yangon' }),
    );
    const session = mmTime.getHours() < 13 ? 'MORNING' : 'EVENING';

    // ၂။ ထိုးထားသမျှ PENDING ဖြစ်နေသော Bet များကို ရှာခြင်း
    const bets = await this.prisma.bet.findMany({
      where: {
        type,
        session,
        status: 'PENDING',
      },
      include: { user: true },
    });

    let winCount = 0;

    for (const bet of bets) {
      if (bet.number === winNumber) {
        // ✅ ပေါက်သောသူများအတွက် တွက်ချက်ခြင်း
        const multiplier = type === '2D' ? 80 : 500;
        const winAmount = Number(bet.amount) * multiplier;

        // ၃။ Database Transaction (Atomic Update)
        await this.prisma.$transaction([
          // User Balance တိုးပေးခြင်း
          this.prisma.user.update({
            where: { id: bet.userId },
            data: { balance: { increment: winAmount } },
          }),
          // Bet Status ကို WIN ပြောင်းခြင်း
          this.prisma.bet.update({
            where: { id: bet.id },
            data: { status: 'WIN' },
          }),
          // Withdraw Table တွင် Payout အဖြစ် စာရင်းသွင်းခြင်း (Required Fields အားလုံးပါဝင်သည်)
          this.prisma.withdraw.create({
            data: {
              user: {
                connect: { id: bet.userId },
              },
              amount: winAmount,
              status: 'APPROVED',
              method: 'WIN_PAYOUT',
              phoneNumber: 'SYSTEM_PAYOUT', // Schema အရ လိုအပ်သောကြောင့် dummy ထည့်ပေးခြင်း
              accountName: bet.user.username || 'WINNER', // User username သို့မဟုတ် Default name
            },
          }),
        ]);

        // ၄။ Telegram မှတစ်ဆင့် User ထံသို့ အောင်မြင်ကြောင်း ပို့ခြင်း
        try {
          await this.bot.telegram.sendMessage(
            Number(bet.user.telegramId),
            `🎉 <b>ဂုဏ်ယူပါတယ်!</b>\n\nလူကြီးမင်းထိုးထားသော <b>${bet.number}</b> ဂဏန်း ပေါက်ပါသည်။\n💰 အနိုင်ရငွေ: <b>${winAmount.toLocaleString()} MMK</b> ကို လက်ကျန်ငွေထဲ ထည့်သွင်းပေးလိုက်ပါပြီ။`,
            { parse_mode: 'HTML' },
          );
        } catch (e) {
          console.error(`Telegram notify error for user ${bet.userId}:`, e);
        }

        winCount++;
      } else {
        // ❌ မပေါက်သောသူများအတွက် Status ပြောင်းလဲခြင်း
        await this.prisma.bet.update({
          where: { id: bet.id },
          data: { status: 'LOSE' },
        });

        try {
          await this.bot.telegram.sendMessage(
            Number(bet.user.telegramId),
            `😞 စိတ်မကောင်းပါဘူးခင်ဗျာ။\nယနေ့ထွက်ဂဏန်းမှာ <b>${winNumber}</b> ဖြစ်ပြီး လူကြီးမင်းထိုးထားသော <b>${bet.number}</b> မပေါက်ပါ။`,
            { parse_mode: 'HTML' },
          );
        } catch (e) {
          console.error(`Telegram notify error for user ${bet.userId}:`, e);
        }
      }
    }

    return {
      success: true,
      winCount,
      totalBets: bets.length,
      message: `${type} Result (${winNumber}) ထုတ်ပြန်ပြီးပါပြီ။`,
    };
  }

  @Post('high-low/play')
  async play(
    @Body()
    body: {
      telegramId: string;
      amount: number;
      choice: 'HIGH' | 'LOW';
    },
  ) {
    const { telegramId, amount, choice } = body;
    const tid = BigInt(telegramId);

    const user = await this.prisma.user.findUnique({
      where: { telegramId: tid },
    });

    if (!user || Number(user.balance) < amount)
      throw new BadRequestException('Insufficient balance');

    // --- Win/Lose Logic ---
    const settings = await this.getSettings();
    const winRatio = parseInt(settings['winRatio'] || '40');
    const multiplier = parseFloat(settings['payoutMultiplier'] || '1.8');

    const isWin = Math.floor(Math.random() * 100) < winRatio;
    const resultNum = isWin
      ? choice === 'HIGH'
        ? Math.floor(Math.random() * 50) + 50
        : Math.floor(Math.random() * 50)
      : choice === 'HIGH'
        ? Math.floor(Math.random() * 50)
        : Math.floor(Math.random() * 50) + 50;

    const payout = isWin ? amount * multiplier : 0;

    // --- DB Transaction ---
    const updatedUser = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { balance: { decrement: amount } },
      });

      const bet = await tx.highLowBet.create({
        data: {
          userId: user.id,
          amount,
          choice,
          resultNum,
          status: isWin ? 'WIN' : 'LOSE',
          payout,
        },
      });

      if (isWin) {
        return await tx.user.update({
          where: { id: user.id },
          data: { balance: { increment: payout } },
        });
      }
      return await tx.user.findUnique({ where: { id: user.id } });
    });

    // --- 💡 Telegram သို့ Notification ပို့ခြင်း (Sync ဖြစ်စေရန်) ---
    const resultEmoji = isWin ? '🎉' : '😢';
    const statusText = isWin ? `နိုင်ပါတယ် (Winner)` : `ရှုံးပါတယ် (Loser)`;

    try {
      await this.bot.telegram.sendMessage(
        Number(telegramId),
        `${resultEmoji} <b>High/Low Result</b>\n\n` +
          `ဂဏန်း: <b>${resultNum}</b> (${resultNum >= 50 ? 'HIGH' : 'LOW'})\n` +
          `ရလဒ်: <b>${statusText}</b>\n` +
          `ပမာဏ: <b>${isWin ? '+' : '-'}${isWin ? payout : amount} MMK</b>\n\n` +
          `💰 လက်ကျန်ငွေ: <b>${Number(updatedUser.balance).toLocaleString()} MMK</b>`,
        { parse_mode: 'HTML' },
      );
    } catch (e) {
      console.error('Failed to send TG message:', e);
    }

    return {
      resultNum,
      isWin,
      payout,
      newBalance: Number(updatedUser.balance),
    };
  }

  // private async getSettings() {
  //   const settings = await this.prisma.systemSetting.findMany();
  //   return settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});
  // }
}
