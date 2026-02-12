import { Ctx, On, Scene, SceneEnter } from 'nestjs-telegraf';
import { BotContext } from 'src/interfaces/bot-context.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { Markup } from 'telegraf';

@Scene('withdraw_scene')
export class WithdrawScene {
  constructor(private readonly prisma: PrismaService) {}

  private mainMenu = Markup.keyboard([
    ['🎰 2D ထိုးမယ်', '🎲 3D ထိုးမယ်'],
    ['🎲 အနိမ့်/အမြင့်', '🛒 စျေးဝယ်မယ်'],
    ['💰 လက်ကျန်ငွေ', '➕ ငွေဖြည့်မယ်'],
    ['📝 ထိုးမှတ်တမ်း', '💸 ငွေထုတ်မယ်'],
    ['📞 အကူအညီ'],
  ]).resize();

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    await ctx.reply(
      '💸 <b>ငွေထုတ်ယူခြင်း</b>\n\nထုတ်ယူလိုသော ပမာဏကို ရိုက်ထည့်ပါ (အနည်းဆုံး 10000 ကျပ်)',
      { parse_mode: 'HTML', ...Markup.keyboard([['❌ ပယ်ဖျက်မည်']]).resize() },
    );
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext) {
    const input = (ctx.message as any).text.trim();
    const state = ctx.scene.state as any;

    if (input === '❌ ပယ်ဖျက်မည်') {
      await ctx.reply('ငွေထုတ်ယူခြင်းကို ပယ်ဖျက်လိုက်ပါပြီ။', this.mainMenu);
      return ctx.scene.leave();
    }

    // Step 1: Amount Validation
    if (!state.amount) {
      const amount = parseInt(input);
      const user = await this.prisma.user.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
      });

      if (isNaN(amount) || amount < 10000)
        return ctx.reply('❌ အနည်းဆုံး 10,000 ကျပ် ဖြစ်ရပါမယ်။');
      if (!user || Number(user.balance) < amount)
        return ctx.reply('❌ လက်ကျန်ငွေ မလုံလောက်ပါ။');

      state.amount = amount;
      await ctx.reply(
        '🏦 <b>ငွေထုတ်မည့် နည်းလမ်းကို ရွေးချယ်ပါ</b>',
        Markup.keyboard([
          ['KPay', 'WaveMoney'],
          ['CB Pay', 'AYAPay'],
          ['❌ ပယ်ဖျက်မည်'],
        ]).resize(),
      );
      return;
    }

    // Step 2: Method Selection
    if (!state.method) {
      const validMethods = ['KPay', 'WaveMoney', 'CB Pay', 'AYAPay'];
      if (!validMethods.includes(input)) {
        return ctx.reply('❌ ကျေးဇူးပြု၍ ခလုတ်ထဲမှ နည်းလမ်းကို ရွေးချယ်ပေးပါ။');
      }
      state.method = input;
      await ctx.reply(
        `📱 <b>${state.method} အချက်အလက်ပေးပို့ပါ</b>\n\nဖုန်းနံပါတ်နှင့် အကောင့်အမည်ကို အောက်ပါအတိုင်း ရိုက်ပို့ပေးပါ-\n\nဥပမာ - <code>09123456789 ဦးလှလှ</code>`,
        {
          parse_mode: 'HTML',
          ...Markup.keyboard([['❌ ပယ်ဖျက်မည်']]).resize(),
        },
      );
      return;
    }

    // Step 3: Parse Phone and Name
    const parts = input.split(' ');
    const phone = parts[0];
    const accountName = parts.slice(1).join(' ');

    if (!phone || !accountName) {
      return ctx.reply(
        '❌ ပုံစံမမှန်ပါ။ "ဖုန်းနံပါတ် နာမည်" ဟု သေချာရိုက်ပေးပါ။',
      );
    }

    try {
      const dbUser = await this.prisma.user.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
      });

      // Transaction logic
      const withdrawRecord = await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: dbUser.id },
          data: { balance: { decrement: state.amount } },
        });

        return await tx.withdraw.create({
          data: {
            userId: dbUser.id,
            amount: state.amount,
            method: state.method,
            phoneNumber: phone,
            accountName: accountName,
            status: 'PENDING',
          },
        });
      });

      // User Confirmation
      await ctx.reply(
        '✅ ငွေထုတ်ယူရန် တောင်းဆိုမှု အောင်မြင်ပါသည်။\nAdmin မှ စစ်ဆေးပြီး အမြန်ဆုံး လွှဲပေးပါလိမ့်မည်။',
        this.mainMenu,
      );

      // Admin Message with Buttons
      const adminMsg = await ctx.telegram.sendMessage(
        process.env.ADMIN_ID,
        `🔔 <b>ငွေထုတ်ရန် တောင်းဆိုမှု</b>\n\n` +
          `👤 User: <b>${ctx.from.first_name}</b>\n` +
          `💰 Amount: <b>${state.amount.toLocaleString()} MMK</b>\n` +
          `🏦 Method: <b>${state.method}</b>\n` +
          `📱 Phone: <code>${phone}</code>\n` +
          `📛 Name: <b>${accountName}</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                '✅ Approve',
                `approve_withdraw_${withdrawRecord.id}`,
              ),
              Markup.button.callback(
                '❌ Reject',
                `reject_withdraw_${withdrawRecord.id}`,
              ),
            ],
          ]),
        },
      );

      // --- FIXED: Sync step - Save message ID to DB ---
      await this.prisma.withdraw.update({
        where: { id: withdrawRecord.id },
        data: { adminMessageId: adminMsg.message_id.toString() },
      });

      return ctx.scene.leave();
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ အမှားအယွင်းရှိသွားပါသည်။', this.mainMenu);
      return ctx.scene.leave();
    }
  }
}
