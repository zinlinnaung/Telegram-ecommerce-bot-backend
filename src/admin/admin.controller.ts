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
  Query,
  UseInterceptors,
  UploadedFile,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import { BotContext } from 'src/interfaces/bot-context.interface';
import { WithdrawService } from 'src/wallet/withdraw.service';
import { TransactionType, WithdrawStatus } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage, memoryStorage } from 'multer';
import { extname } from 'path';
import { WalletService } from 'src/wallet/wallet.service';
import { CreateDepositDto } from './dto/deposit.dto';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectBot() private readonly bot: Telegraf<BotContext>,
    private readonly withdrawService: WithdrawService,
    private readonly walletService: WalletService,
  ) {}

  @Get('dashboard-stats')
  async getStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      userCount,
      pendingDeps,
      pendingWiths,
      pendingOrders,
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
      this.prisma.purchase.count({ where: { status: 'PENDING' } }),

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
      pendingOrdersCount: pendingOrders,
      todayRevenue: totalRevenue, // စုစုပေါင်းဝင်ငွေ
      todayPurchase: purchaseRevenue, // အရောင်းသီးသန့်
      todayDeposit: depositIncome, // ငွေဖြည့်သွင်းမှုသီးသန့်
      todayWithdraw: expense,
      netProfit: netProfit,
    };
  }

  @Get('orders')
  async getAllOrders(
    @Query('status') status?: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10', // Dashboard အတွက် 10 က ပိုသင့်တော်ပါတယ်
  ) {
    // ၁။ Query Params များကို ကိန်းဂဏန်းအဖြစ်ပြောင်းလဲခြင်း (Validation အပါအဝင်)
    const p = Math.max(1, parseInt(page) || 1); // အနည်းဆုံး 1 ဖြစ်ရမယ်
    const l = Math.max(1, parseInt(limit) || 10); // အနည်းဆုံး 1 ဖြစ်ရမယ်
    const skip = (p - 1) * l;

    const whereClause: any = {};
    if (status && status !== 'ALL') {
      whereClause.status = status;
    }

    // ၂။ Database မှ Data နှင့် စုစုပေါင်းအရေအတွက်ကို တပြိုင်တည်းဆွဲယူခြင်း
    const [orders, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where: whereClause,
        skip,
        take: l,
        orderBy: { createdAt: 'desc' },
        include: {
          user: true,
          product: true,
        },
      }),
      this.prisma.purchase.count({ where: whereClause }),
    ]);

    // ၃။ Frontend အတွက် Data Format ပြင်ဆင်ခြင်း
    const formattedOrders = orders.map((order) => ({
      ...order,
      amount: order.amount.toString(),
      // Prisma model မှာ nickname မပါသေးရင် (order as any) သုံးလို့ရပေမဲ့ database မှာ ရှိဖို့တော့လိုပါတယ်
      nickname: (order as any).nickname || 'N/A',
      user: {
        ...order.user,
        telegramId: order.user.telegramId.toString(),
        balance: order.user.balance.toString(),
      },
    }));

    // ၄။ Pagination Meta Data ပြန်ပေးခြင်း
    const lastPage = Math.ceil(total / l);

    return {
      data: formattedOrders,
      meta: {
        total,
        page: p,
        lastPage: lastPage || 1, // data မရှိရင်လည်း 1 လို့ပြမယ်
        limit: l,
      },
    };
  }
  @Get('products')
  async getAllProducts() {
    return this.prisma.product.findMany({
      include: { keys: true },
    });
  }

  @Get('users')
  async getAllUsers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('search') search?: string, // ရှာဖွေလိုပါက search ပါ ထည့်ပေးထားသည်
  ) {
    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.max(1, parseInt(limit) || 10);
    const skip = (p - 1) * l;

    // Search query logic (Optional: Username သို့မဟုတ် ID ဖြင့် ရှာရန်)
    const whereClause: any = {};
    if (search) {
      whereClause.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        // BigInt ဖြစ်တဲ့အတွက် telegramId ကို string နဲ့ ရှာချင်ရင် ရှာလို့မရတာမျိုး ရှိနိုင်လို့ name ကိုပဲ ဦးစားပေးထားပါတယ်
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where: whereClause,
        skip,
        take: l,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where: whereClause }),
    ]);

    // BigInt များကို String သို့ ပြောင်းလဲခြင်း
    const formattedUsers = users.map((user) => ({
      ...user,
      telegramId: user.telegramId.toString(),
      balance: user.balance.toString(),
    }));

    return {
      data: formattedUsers,
      meta: {
        total,
        page: p,
        lastPage: Math.ceil(total / l) || 1,
        limit: l,
      },
    };
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
          process.env.ADMIN_CHANNEL_ID, // Bot Admin ရဲ့ Chat ID
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

  // admin.controller.ts ထဲသို့ ထည့်ရန်

  @Get('transactions')
  async getAllTransactions(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    const p = parseInt(page);
    const l = parseInt(limit);
    const skip = (p - 1) * l;

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        skip,
        take: l,
        orderBy: { createdAt: 'desc' },
        include: { user: true },
      }),
      this.prisma.transaction.count(),
    ]);

    return {
      data: transactions.map((t) => ({
        ...t,
        amount: t.amount.toString(),
        telegramId: t.user.telegramId.toString(),
        username: t.user.username || t.user.firstName || 'Unknown',
      })),
      meta: {
        total,
        page: p,
        lastPage: Math.ceil(total / l),
      },
    };
  }

  @Post('reject-deposit/:id')
  async rejectDep(@Param('id', ParseIntPipe) id: number) {
    // 1. Update the status AND include the user so we get the Telegram ID
    const deposit = await this.prisma.deposit.update({
      where: { id },
      data: { status: 'REJECTED' },
      include: { user: true },
    });

    if (!deposit) throw new NotFoundException('Deposit not found');

    // 2. Send the Telegram Notification via the Bot instance
    try {
      const userTid = deposit.user.telegramId.toString(); // BigInt safe
      const amountStr = Number(deposit.amount).toLocaleString();

      await this.bot.telegram.sendMessage(
        userTid,
        `❌ <b>Deposit Rejected (via Dashboard)</b>\n\n` +
          `လူကြီးမင်း ပေးပို့ထားသော ${amountStr} MMK ငွေဖြည့်သွင်းမှုကို Admin မှ Dashboard မှတစ်ဆင့် ငြင်းပယ်လိုက်ပါသည်။\n\n` +
          `အကယ်၍ အမှားအယွင်းရှိသည်ဟု ထင်မြင်ပါက Support သို့ ဆက်သွယ်နိုင်ပါသည်။`,
        { parse_mode: 'HTML' },
      );
    } catch (error: any) {
      // We log the error but don't fail the request,
      // because the DB update was already successful.
      console.error('Failed to send rejection notification:', error.message);
    }

    return {
      success: true,
      message: 'Deposit rejected and user notified',
    };
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

  @Post('deduct-balance')
  async deductBalance(
    @Body() body: { userId: number; amount: number; reason: string },
  ) {
    const { userId, amount, reason } = body;

    // ၁။ Validation
    if (!userId || !amount || amount <= 0) {
      throw new BadRequestException(
        'User ID နှင့် မှန်ကန်သော ပမာဏ လိုအပ်ပါသည်',
      );
    }

    try {
      // ၂။ Database Transaction (Balance နှုတ်ခြင်း နှင့် မှတ်တမ်းသွင်းခြင်း)
      const result = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });

        if (!user) throw new NotFoundException('User ရှာမတွေ့ပါ');
        if (Number(user.balance) < amount) {
          throw new BadRequestException(
            'User တွင် နှုတ်ရန် လက်ကျန်ငွေ မလုံလောက်ပါ',
          );
        }

        // Balance ကို နှုတ်သည်
        const updatedUser = await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: amount } },
        });

        // Transaction Table တွင် မှတ်တမ်းသွင်းသည်
        await tx.transaction.create({
          data: {
            userId: userId,
            amount: amount,
            type: 'PURCHASE', // သင့် Enum ရှိ PURCHASE ကို သုံးထားသည်
            description: `Admin Manual Deduct: ${reason}`,
          },
        });

        return updatedUser;
      });

      // ၃။ User ထံသို့ Telegram Notification ပို့ခြင်း
      try {
        const message =
          `💸 <b>သင့်အကောင့်မှ ငွေနှုတ်ယူခြင်း ခံရပါသည်</b>\n\n` +
          `💰 နှုတ်ယူသည့် ပမာဏ: <b>${amount.toLocaleString()} MMK</b>\n` +
          `📝 အကြောင်းပြချက်: <b>${reason}</b>\n` +
          `💵 လက်ကျန်ငွေ: <b>${Number(result.balance).toLocaleString()} MMK</b>`;

        await this.bot.telegram.sendMessage(
          result.telegramId.toString(),
          message,
          {
            parse_mode: 'HTML',
          },
        );
      } catch (tgError: any) {
        console.error(
          'Failed to send deduction notification:',
          tgError.message,
        );
      }

      return {
        success: true,
        message: 'Balance deducted successfully',
        newBalance: result.balance.toString(),
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      console.error('Deduct Balance Error:', error);
      throw new InternalServerErrorException('ငွေနှုတ်ယူမှု လုပ်ဆောင်၍မရပါ');
    }
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
  async settleResult(
    @Body()
    body: {
      type: '2D' | '3D';
      winNumber: string;
      session?: 'MORNING' | 'EVENING';
    },
  ) {
    const { type, winNumber } = body;

    // ၁။ Session ကို Body ကနေယူမယ်၊ မပါလာမှ အချိန်နဲ့တွက်မယ်
    let targetSession = body.session;

    if (!targetSession) {
      const now = new Date();
      const mmTime = new Date(
        now.toLocaleString('en-US', { timeZone: 'Asia/Yangon' }),
      );
      targetSession = mmTime.getHours() < 13 ? 'MORNING' : 'EVENING';
    }

    // ၂။ Bet များကို Fetch လုပ်ခြင်း
    const bets = await this.prisma.bet.findMany({
      where: {
        type,
        session: targetSession,
        status: 'PENDING',
      },
      include: { user: true },
    });

    if (bets.length === 0) {
      return {
        success: false,
        winCount: 0,
        message: `${targetSession} အတွက် တွက်ချက်ရန် Bet မရှိပါ`,
      };
    }

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

    // ၃။ Database Processing
    for (const bet of bets) {
      try {
        const userId = bet.userId;
        if (!userResults.has(userId)) {
          userResults.set(userId, {
            telegramId: bet.user.telegramId.toString(),
            winNumbers: [],
            loseNumbers: [],
            totalWinAmount: 0,
          });
        }

        const data = userResults.get(userId); // Fixed variable name from userData to data for consistency in loop below or just use logic correctly

        if (bet.number === winNumber) {
          const multiplier = type === '2D' ? 80 : 500;
          const winAmount = Number(bet.amount) * multiplier;

          // Transaction
          await this.prisma.$transaction([
            this.prisma.user.update({
              where: { id: userId },
              data: { balance: { increment: winAmount } },
            }),
            this.prisma.bet.update({
              where: { id: bet.id },
              data: { status: 'WIN' },
            }),

            // 💡 Transaction မှတ်တမ်းအသစ် ထည့်သွင်းခြင်း
            this.prisma.transaction.create({
              data: {
                userId: userId,
                amount: winAmount,
                type: TransactionType.REFUND, // သို့မဟုတ် Enum မှာ အသစ်တိုးပြီး 'WIN_PAYOUT' သုံးပါ
                description: `${type} (${targetSession}) ပေါက်ဂဏန်း ${winNumber} အတွက် အနိုင်ရငွေ`,
              },
            }),
            this.prisma.withdraw.create({
              data: {
                userId: userId,
                amount: winAmount,
                status: 'APPROVED',
                method: 'WIN_PAYOUT',
                phoneNumber: 'SYSTEM_PAYOUT',
                accountName: bet.user.username || 'WINNER',
              },
            }),
          ]);

          data.winNumbers.push(bet.number);
          data.totalWinAmount += winAmount;
          winCount++;
        } else {
          await this.prisma.bet.update({
            where: { id: bet.id },
            data: { status: 'LOSE' },
          });
          data.loseNumbers.push(bet.number);
        }
      } catch (error) {
        console.error(`Error processing bet ID ${bet.id}:`, error);
        continue;
      }
    }

    // ၄။ Telegram Notifications (Logic ပြင်ဆင်ထားသည့်အပိုင်း)
    const notificationPromises = Array.from(userResults.entries()).map(
      async ([userId, data]) => {
        let message = `🔔 <b>${type} (${targetSession}) ရလဒ် ထွက်ပေါ်လာပါပြီ (${winNumber})</b>\n\n`;

        // ✅ အနိုင်ရရှိသူဖြစ်မှသာ ငွေထည့်သွင်းကြောင်း စာသားထည့်မည်
        if (data.winNumbers.length > 0) {
          message += `🎉 <b>ဂုဏ်ယူပါတယ်!</b>\n`;
          message += `✅ ပေါက်ဂဏန်း: <b>${data.winNumbers.join(', ')}</b>\n`;
          message += `💰 စုစုပေါင်းအနိုင်ရငွေ: <b>${data.totalWinAmount.toLocaleString()} MMK</b>\n`;
          message += `ℹ️ <i>လက်ကျန်ငွေထဲသို့ အလိုအလျောက် ထည့်သွင်းပေးပြီးပါပြီ။</i>\n\n`;
        }

        if (data.loseNumbers.length > 0) {
          message += `😞 <b>မပေါက်သောဂဏန်းများ:</b>\n`;
          message += `❌ ${data.loseNumbers.join(', ')}\n\n`;
        }

        try {
          await this.bot.telegram.sendMessage(data.telegramId, message, {
            parse_mode: 'HTML',
          });
        } catch (e) {
          console.error(`Telegram failed for user ${userId}:`, e);
        }
      },
    );

    await Promise.allSettled(notificationPromises);

    return {
      success: true,
      winCount,
      totalBets: bets.length,
      message: `${type} ${targetSession} Result (${winNumber}) ထုတ်ပြန်ပြီးပါပြီ။`,
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

      // 💡 ငွေနှုတ်ယူမှု Transaction မှတ်တမ်း
      await tx.transaction.create({
        data: {
          userId: user.id,
          amount: amount,
          type: 'PURCHASE',
          description: `High/Low ဂိမ်းလောင်းကြေး (${choice})`,
        },
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

        // 💡 အနိုင်ရငွေ Transaction မှတ်တမ်း
        await tx.transaction.create({
          data: {
            userId: user.id,
            amount: payout,
            type: 'REFUND',
            description: `High/Low ဂိမ်းအနိုင်ရငွေ (ဂဏန်း: ${resultNum})`,
          },
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

  // 1. Create Product (Updated with 'type')
  @Post('products')
  async createProduct(
    @Body()
    body: {
      name: string;
      category: string;
      description?: string;
      price: number;
      type: 'AUTO' | 'MANUAL'; // Type ထည့်လိုက်ပါပြီ
    },
  ) {
    return this.prisma.product.create({
      data: {
        name: body.name,
        category: body.category,
        description: body.description,
        price: body.price,
        type: body.type || 'AUTO',
      },
    });
  }

  // 2. Update Product (Updated with 'type')
  @Put('products/:id')
  async updateProduct(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      name?: string;
      category?: string;
      description?: string;
      price?: number;
      type?: 'AUTO' | 'MANUAL';
    },
  ) {
    return this.prisma.product.update({
      where: { id },
      data: {
        name: body.name,
        category: body.category,
        description: body.description,
        price: body.price,
        type: body.type,
      },
    });
  }

  // --- 💡 Game Top-up Order Management (New) ---

  // ၂။ Order ကို အတည်ပြုခြင်း (Done)
  @Post('approve-order/:id')
  async approveOrder(@Param('id', ParseIntPipe) id: number) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: { user: true, product: true },
    });

    if (!purchase || purchase.status !== 'PENDING') {
      throw new BadRequestException(
        'အော်ဒါရှာမတွေ့ပါ သို့မဟုတ် ကိုင်တွယ်ပြီးသားဖြစ်နေသည်',
      );
    }

    await this.prisma.purchase.update({
      where: { id },
      data: { status: 'COMPLETED' },
    });

    // Telegram Notification
    const message =
      `✅ <b>ဝယ်ယူမှု အောင်မြင်ပါသည်!</b>\n\n` +
      `📦 ပစ္စည်း: <b>${purchase.product.name}</b>\n` +
      `🎮 အကောင့်အမည်: <b>${(purchase as any).nickname || 'N/A'}</b>\n` +
      `🆔 ID: <code>${purchase.playerId}</code> ${purchase.serverId ? `(${purchase.serverId})` : ''}\n\n` +
      `Admin မှ Diamonds/UC ဖြည့်သွင်းပေးပြီးပါပြီ။ ကျေးဇူးတင်ပါသည်။`;

    try {
      await this.bot.telegram.sendMessage(
        purchase.user.telegramId.toString(),
        message,
        { parse_mode: 'HTML' },
      );
    } catch (e) {
      console.error('Failed to notify user', e);
    }

    return { success: true, message: 'Order completed successfully' };
  }

  // ၃။ Order ကို ပယ်ဖျက်ခြင်း (Reject & Refund)
  @Post('reject-order/:id')
  async rejectOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason?: string }, // Dashboard ကနေ Reject reason ထည့်ချင်ရင် သုံးနိုင်သည်
  ) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: { user: true, product: true },
      });

      if (!purchase || purchase.status !== 'PENDING') {
        throw new BadRequestException(
          'အော်ဒါရှာမတွေ့ပါ သို့မဟုတ် ကိုင်တွယ်ပြီးသားဖြစ်နေသည်',
        );
      }

      // 1. Status Update
      await tx.purchase.update({
        where: { id },
        data: { status: 'REJECTED' },
      });

      // 2. Refund Money
      await tx.user.update({
        where: { id: purchase.userId },
        data: { balance: { increment: purchase.amount } },
      });

      // 3. Transaction History
      await tx.transaction.create({
        data: {
          userId: purchase.userId,
          amount: purchase.amount,
          type: 'REFUND',
          description: `ပယ်ဖျက်လိုက်သော အော်ဒါ #${purchase.id} အတွက် ငွေပြန်အမ်းခြင်း`,
        },
      });

      // 4. Telegram Notification
      const message =
        `❌ <b>ဝယ်ယူမှု ပယ်ဖျက်ခံရပါသည်</b>\n\n` +
        `📦 ပစ္စည်း: ${purchase.product.name}\n` +
        `💰 ပမာဏ: <b>${Number(purchase.amount).toLocaleString()} MMK</b>\n` +
        `ℹ️ အကြောင်းပြချက်: ${body.reason || 'အချက်အလက်မှားယွင်းနေခြင်း'}\n\n` +
        `သင့်အကောင့်ထဲသို့ ငွေပြန်လည်ထည့်သွင်းပေးပြီးပါပြီ။`;

      try {
        await this.bot.telegram.sendMessage(
          purchase.user.telegramId.toString(),
          message,
          { parse_mode: 'HTML' },
        );
      } catch (e) {
        console.error('Failed to notify user', e);
      }

      return { success: true, message: 'Order rejected and refunded' };
    });
  }

  // --- အောက်က Functions တွေက မူလအတိုင်းပဲ ထားနိုင်ပါတယ် ---

  @Delete('products/:id')
  async deleteProduct(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.productKey.deleteMany({ where: { productId: id } });
    return this.prisma.product.delete({ where: { id } });
  }

  @Post('products/:id/keys')
  async addProductKey(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { key: string },
  ) {
    return this.prisma.productKey.create({
      data: { key: body.key, productId: id, isUsed: false },
    });
  }

  @Post('deposit-with-image')
  @UseInterceptors(FileInterceptor('image', { storage: memoryStorage() }))
  async depositWithImage(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateDepositDto, // 👈 Use DTO instead of 'any'
  ) {
    if (!file) throw new BadRequestException('Image file is missing');

    const { telegramId, amount, method } = body;
    const adminChannelId = process.env.ADMIN_CHANNEL_ID;

    try {
      // 1. Send to Telegram
      const message = await this.bot.telegram.sendPhoto(
        adminChannelId,
        { source: file.buffer },
        {
          caption: `🔄 <b>Processing WebApp Deposit...</b>\n\nUser: ${telegramId}\nAmount: ${amount}`,
          parse_mode: 'HTML',
        },
      );

      const fileId = message.photo[message.photo.length - 1].file_id;

      // 2. Save to DB
      const deposit = await this.walletService.createDepositFromWebApp({
        telegramId,
        amount: Number(amount),
        method,
        proofFileId: fileId,
      });

      // 3. Update Admin Message with Action Buttons
      await this.bot.telegram.editMessageCaption(
        adminChannelId,
        message.message_id,
        undefined,
        `🌐 <b>New WebApp Deposit Request</b>\n` +
          `➖➖➖➖➖➖➖➖➖➖\n` +
          `👤 User: <b>${deposit.user.firstName}</b>\n` +
          `💰 Amount: <b>${Number(amount).toLocaleString()} MMK</b>\n` +
          `💳 Method: <b>${method}</b>\n` +
          `#Deposit_${deposit.id}`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '✅ Approve',
                  callback_data: `approve_deposit_${deposit.id}`,
                },
                {
                  text: '❌ Reject',
                  callback_data: `reject_deposit_${deposit.id}`,
                },
              ],
            ],
          },
        },
      );

      return { success: true };
    } catch (error) {
      console.error('Deposit Error:', error);
      throw new InternalServerErrorException('Failed to process deposit');
    }
  }
}
