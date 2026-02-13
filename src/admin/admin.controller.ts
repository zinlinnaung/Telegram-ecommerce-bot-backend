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
  NotFoundException,
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

  @Get('by-telegram/:tid')
  async getUserByTelegramId(@Param('tid') tid: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        telegramId: BigInt(tid), // BigInt ပြောင်းပြီးရှာမယ်
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 💡 အရေးကြီးသည်: Decimal နှင့် BigInt ကို JSON ပို့ရန် String ပြောင်းပေးရမည်
    return {
      ...user,
      telegramId: user.telegramId.toString(),
      balance: user.balance.toString(),
    };
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

    // ၁။ လက်ရှိ မြန်မာစံတော်ချိန် Session သတ်မှတ်ခြင်း
    const now = new Date();
    const mmTime = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Yangon' }),
    );
    const session = mmTime.getHours() < 13 ? 'MORNING' : 'EVENING';

    // ၂။ Bet များကို ရှာဖွေခြင်း
    const bets = await this.prisma.bet.findMany({
      where: { type, session, status: 'PENDING' },
      include: { user: true },
    });

    // 💡 User အလိုက် ရလဒ်များကို စုစည်းရန် Map တစ်ခု တည်ဆောက်ခြင်း
    const userResults = new Map<
      number,
      {
        telegramId: string;
        winNumbers: string[];
        loseNumbers: string[];
        totalWinAmount: number;
      }
    >();

    let winCount = 0;

    for (const bet of bets) {
      const userId = bet.userId;

      // User ရဲ့ လက်ရှိ record ကို Map ထဲမှာ ရှာသည်၊ မရှိရင် အသစ်ဆောက်သည်
      if (!userResults.has(userId)) {
        userResults.set(userId, {
          telegramId: bet.user.telegramId.toString(),
          winNumbers: [],
          loseNumbers: [],
          totalWinAmount: 0,
        });
      }

      const userData = userResults.get(userId);

      if (bet.number === winNumber) {
        // ✅ ပေါက်သောကွက်များအတွက်
        const multiplier = type === '2D' ? 80 : 500;
        const winAmount = Number(bet.amount) * multiplier;

        await this.prisma.$transaction([
          this.prisma.user.update({
            where: { id: userId },
            data: { balance: { increment: winAmount } },
          }),
          this.prisma.bet.update({
            where: { id: bet.id },
            data: { status: 'WIN' },
          }),
          this.prisma.withdraw.create({
            data: {
              user: { connect: { id: userId } },
              amount: winAmount,
              status: 'APPROVED',
              method: 'WIN_PAYOUT',
              phoneNumber: 'SYSTEM_PAYOUT',
              accountName: bet.user.username || 'WINNER',
            },
          }),
        ]);

        userData.winNumbers.push(bet.number);
        userData.totalWinAmount += winAmount;
        winCount++;
      } else {
        // ❌ မပေါက်သောကွက်များအတွက်
        await this.prisma.bet.update({
          where: { id: bet.id },
          data: { status: 'LOSE' },
        });
        userData.loseNumbers.push(bet.number);
      }
    }

    // ၃။ 💡 User တစ်ယောက်ချင်းစီအတွက် စာရင်းချုပ် Message တစ်စောင်စီ ပို့ခြင်း
    for (const [userId, data] of userResults.entries()) {
      let message = `🔔 <b>${type} ရလဒ် ထွက်ပေါ်လာပါပြီ (${winNumber})</b>\n\n`;

      if (data.winNumbers.length > 0) {
        message += `🎉 <b>ဂုဏ်ယူပါတယ်!</b>\n`;
        message += `✅ ပေါက်ဂဏန်း: <b>${data.winNumbers.join(', ')}</b>\n`;
        message += `💰 စုစုပေါင်းအနိုင်ရငွေ: <b>${data.totalWinAmount.toLocaleString()} MMK</b>\n\n`;
      }

      if (data.loseNumbers.length > 0) {
        message += `😞 <b>မပေါက်သောဂဏန်းများ:</b>\n`;
        message += `❌ ${data.loseNumbers.join(', ')}\n\n`;
      }

      message += `လက်ကျန်ငွေထဲသို့ အလိုအလျောက် ထည့်သွင်းပေးပြီးပါပြီ။`;

      try {
        await this.bot.telegram.sendMessage(Number(data.telegramId), message, {
          parse_mode: 'HTML',
        });
      } catch (e) {
        console.error(`Telegram notify error for user ${userId}:`, e);
      }
    }

    return {
      success: true,
      winCount,
      totalBets: bets.length,
      message: `${type} Result (${winNumber}) ထုတ်ပြန်ပြီးပါပြီ။`,
    };
  }

  //  // System Settings ကို Database မှ ဆွဲယူသည့် Helper Method
  //   private async getSettings(): Promise<Record<string, string>> {
  //     const settings = await this.prisma.systemSetting.findMany();
  //     return settings.reduce((acc, item) => {
  //       acc[item.key] = item.value;
  //       return acc;
  //     }, {});
  //   }

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

    // 1. Validation & User Check
    if (!telegramId || !amount || !choice) {
      throw new BadRequestException('Data ပြည့်စုံစွာ ပေးပို့ပေးပါ');
    }

    const tid = BigInt(telegramId);
    const user = await this.prisma.user.findUnique({
      where: { telegramId: tid },
    });

    if (!user) {
      throw new BadRequestException('User ကို ရှာမတွေ့ပါ');
    }

    if (Number(user.balance) < amount) {
      throw new BadRequestException('လက်ကျန်ငွေ မလုံလောက်ပါ');
    }

    // 2. Load Settings from DB
    const settings = await this.getSettings();
    const minBet = parseInt(settings['minBet'] || '500');
    const maxBet = parseInt(settings['maxBet'] || '100000');
    const winRatio = parseInt(settings['winRatio'] || '40');
    const multiplier = parseFloat(settings['payoutMultiplier'] || '1.8');

    // 3. Min/Max Bet Limit Validation
    if (amount < minBet) {
      throw new BadRequestException(
        `အနည်းဆုံးထိုးငွေမှာ ${minBet.toLocaleString()} MMK ဖြစ်ပါသည်။`,
      );
    }
    if (amount > maxBet) {
      throw new BadRequestException(
        `အများဆုံးထိုးငွေမှာ ${maxBet.toLocaleString()} MMK သာဖြစ်ပါသည်။`,
      );
    }

    // 4. Win/Lose Logic (RTP Base + Hard Cap)

    // အဆင့် (က) - Random နှိုက်ပြီး နိုင်မနိုင် အရင်ဆုံးဖြတ်သည်
    let isWin = Math.floor(Math.random() * 100) < winRatio;

    // အဆင့် (ခ) - Win Limit စစ်ဆေးခြင်း
    const potentialPayout = amount * multiplier;
    const hardWinLimit = 30000; // လူကြီးမင်းသတ်မှတ်လိုသော Max Win Limit (ဥပမာ - ၁၅,၀၀၀)
    const doubleBetLimit = amount * 2; // Bet တင်ကြေး၏ ၂ ဆ ထက် မပိုစေရန်

    // အကယ်၍ နိုင်ရန် ဖြစ်နေသော်လည်း Limit ကျော်နေပါက အရှုံးသို့ ပြောင်းမည်
    if (isWin) {
      if (potentialPayout > hardWinLimit || potentialPayout > doubleBetLimit) {
        isWin = false; // Force Lose
      }
    }

    // 5. Result Number Generation (isWin အပေါ်မူတည်၍ ဂဏန်းထုတ်ပေးခြင်း)
    let resultNum: number;
    if (isWin) {
      // နိုင်ရမည် - High ဆိုလျှင် ၅၀-၉၉ ကြား၊ Low ဆိုလျှင် ၀-၄၉ ကြား
      resultNum =
        choice === 'HIGH'
          ? Math.floor(Math.random() * 50) + 50
          : Math.floor(Math.random() * 50);
    } else {
      // ရှုံးရမည် - High ဆိုလျှင် ၀-၄၉ ကြား၊ Low ဆိုလျှင် ၅၀-၉၉ ကြား
      resultNum =
        choice === 'HIGH'
          ? Math.floor(Math.random() * 50)
          : Math.floor(Math.random() * 50) + 50;
    }

    const payout = isWin ? potentialPayout : 0;

    // 6. Database Transaction (Balance Update & Bet Recording)
    const result = await this.prisma.$transaction(async (tx) => {
      // ၁။ ပိုက်ဆံ အရင်နှုတ်မည်
      await tx.user.update({
        where: { id: user.id },
        data: { balance: { decrement: amount } },
      });

      // ၂။ Bet မှတ်တမ်းသွင်းမည်
      const betRecord = await tx.highLowBet.create({
        data: {
          userId: user.id,
          amount,
          choice,
          resultNum,
          status: isWin ? 'WIN' : 'LOSE',
          payout,
        },
      });

      // ၃။ နိုင်လျှင် ပိုက်ဆံပြန်ပေါင်းပေးမည်
      let finalUser;
      if (isWin) {
        finalUser = await tx.user.update({
          where: { id: user.id },
          data: { balance: { increment: payout } },
        });
      } else {
        finalUser = await tx.user.findUnique({
          where: { id: user.id },
        });
      }

      return { betRecord, finalUser };
    });

    // 7. Return Response to Web App
    return {
      success: true,
      resultNum: result.betRecord.resultNum,
      status: result.betRecord.status,
      payout: Number(result.betRecord.payout),
      newBalance: Number(result.finalUser.balance),
      isWin: isWin,
      message: isWin ? '🎉 You Win!' : '😞 You Lose!',
    };
  }

  // --- 💡 Telegram သို့ Notification ပို့ခြင်း (Sync ဖြစ်စေရန်) ---
  // const resultEmoji = isWin ? '🎉' : '😢';
  // const statusText = isWin ? `နိုင်ပါတယ် (Winner)` : `ရှုံးပါတယ် (Loser)`;

  // try {
  //   await this.bot.telegram.sendMessage(
  //     Number(telegramId),
  //     `${resultEmoji} <b>High/Low Result</b>\n\n` +
  //       `ဂဏန်း: <b>${resultNum}</b> (${resultNum >= 50 ? 'HIGH' : 'LOW'})\n` +
  //       `ရလဒ်: <b>${statusText}</b>\n` +
  //       `ပမာဏ: <b>${isWin ? '+' : '-'}${isWin ? payout : amount} MMK</b>\n\n` +
  //       `💰 လက်ကျန်ငွေ: <b>${Number(updatedUser.balance).toLocaleString()} MMK</b>`,
  //     { parse_mode: 'HTML' },
  //   );
  // } catch (e) {
  //   console.error('Failed to send TG message:', e);
  // }

  //   return {
  //     resultNum,
  //     isWin,
  //     payout,
  //     newBalance: Number(updatedUser.balance),
  //   };
  // }

  // private async getSettings() {
  //   const settings = await this.prisma.systemSetting.findMany();
  //   return settings.reduce((acc, curr) => ({ ...acc, [curr.key]: curr.value }), {});
  // }
}
