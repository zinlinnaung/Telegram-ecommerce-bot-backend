import {
  Update,
  Ctx,
  Start,
  Action,
  Command,
  InjectBot,
  Hears,
  On,
} from 'nestjs-telegraf';
import { Telegraf, Markup } from 'telegraf';
import { UsersService } from '../users/users.service';
import { ProductsService } from '../products/products.service';
import { WalletService } from '../wallet/wallet.service';
import { UseFilters } from '@nestjs/common';
import { TelegrafExceptionFilter } from '../common/filters/telegraf-exception.filter';
import { BotContext } from 'src/interfaces/bot-context.interface';
import { PrismaService } from '../prisma/prisma.service';

export const MAIN_KEYBOARD = Markup.keyboard([
  ['🎰 2D ထိုးမယ်', '🎲 3D ထိုးမယ်'],
  ['🎲 အနိမ့်/အမြင့်', '🛒 စျေးဝယ်မယ်'],
  ['💰 လက်ကျန်ငွေ', '➕ ငွေဖြည့်မယ်'],
  ['📝 ထိုးမှတ်တမ်း', '💸 ငွေထုတ်မယ်'],
  ['📞 အကူအညီ'],
]).resize();

@Update()
@UseFilters(TelegrafExceptionFilter)
export class BotUpdate {
  constructor(
    @InjectBot() private readonly bot: Telegraf<BotContext>,
    private readonly usersService: UsersService,
    private readonly productsService: ProductsService,
    private readonly walletService: WalletService,
    private readonly prisma: PrismaService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: BotContext) {
    const user = await this.usersService.findOrCreateUser(
      Number(ctx.from.id),
      ctx.from.first_name,
      ctx.from.username,
    );

    // Use HTML tags <b> instead of Markdown **
    const welcomeText = `👋 <b>Welcome ${user.firstName}!</b>\n\n💰 Your Balance: <b>$${user.balance}</b>`;

    await ctx.reply(welcomeText, {
      parse_mode: 'HTML', // Change this from 'Markdown' to 'HTML'
      ...Markup.keyboard([
        ['🎰 2D ထိုးမယ်', '🎲 3D ထိုးမယ်'],
        ['🎲 အနိမ့်/အမြင့်', '🛒 စျေးဝယ်မယ်'],
        ['💰 လက်ကျန်ငွေ', '➕ ငွေဖြည့်မယ်'],
        ['📝 ထိုးမှတ်တမ်း', '💸 ငွေထုတ်မယ်'],
        ['📞 အကူအညီ'],
      ]).resize(),
    });
  }

  @On('channel_post')
  async onChannelPost(@Ctx() ctx: any) {
    console.log('---------------------------------');
    console.log('📢 Channel Post Detected!');
    console.log('🆔 Channel ID:', ctx.chat.id);
    console.log('💬 Message Text:', ctx.channelPost.text);
    console.log('---------------------------------');
  }

  // @On('message')
  // async onMessage(@Ctx() ctx: any) {
  //   console.log('Chat ID is:', ctx.chat.id); // ဒီကောင်က Channel ID ကို ထုတ်ပြပေးမှာပါ
  // }

  @Command('balance')
  @Hears('💰 လက်ကျန်ငွေ')
  async onBalance(@Ctx() ctx: BotContext) {
    const balance = await this.usersService.getBalance(Number(ctx.from.id));
    await ctx.reply(
      `💰 လူကြီးမင်းရဲ့ လက်ရှိလက်ကျန်ငွေကတော့ <b>${balance} MMK </b> ဖြစ်ပါတယ်ခင်ဗျာ။`,
      {
        parse_mode: 'HTML',
      },
    );
  }

  @Hears('🏠 ပင်မစာမျက်နှာ')
  async onHome(@Ctx() ctx: BotContext) {
    try {
      // ၁။ Scene ထဲမှာ ရှိနေရင် အရင်ထွက်မယ်
      await ctx.scene.leave();
    } catch (e) {
      // Scene ထဲမှာ မရှိရင် error တက်နိုင်လို့ ignore လုပ်မယ်
    }

    const user = await this.usersService.findOrCreateUser(
      Number(ctx.from.id),
      ctx.from.first_name,
      ctx.from.username,
    );

    // ၂။ အဓိကအချက်- Keyboard ပါတဲ့ message ကို ပြန်ပို့ပေးရပါမယ်
    await ctx.reply(
      `🏠 <b>ပင်မစာမျက်နှာသို့ ပြန်ရောက်ပါပြီ။</b>\n\n💰 လက်ရှိလက်ကျန်ငွေ: <b>${user.balance} MMK</b>`,
      {
        parse_mode: 'HTML',
        ...MAIN_KEYBOARD, // Keyboard ကို ပြန်ပြောင်းခိုင်းတာဖြစ်ပါတယ်
      },
    );
  }

  @Hears('🎰 2D ထိုးမယ်')
  async onTwoD(@Ctx() ctx: BotContext) {
    await ctx.scene.enter('scene_2d');
  }

  @Hears('🎲 3D ထိုးမယ်')
  async onThreeD(@Ctx() ctx: BotContext) {
    await ctx.scene.enter('scene_3d');
  }

  @Command('topup')
  @Hears('➕ ငွေဖြည့်မယ်')
  async onTopUp(@Ctx() ctx: BotContext) {
    await ctx.scene.enter('topup_scene');
  }

  @Hears('💸 ငွေထုတ်မယ်')
  async onWithdraw(@Ctx() ctx: BotContext) {
    await ctx.scene.enter('withdraw_scene');
  }

  @Hears('🎲 အနိမ့်/အမြင့်')
  async onHighLow(@Ctx() ctx: BotContext) {
    await ctx.scene.enter('high_low_scene');
  }

  // src/bot/bot.update.ts

  @Hears('📝 ထိုးမှတ်တမ်း')
  async onHistory(@Ctx() ctx: BotContext) {
    const telegramId = BigInt(ctx.from.id);

    try {
      // Database မှ ထိုးထားသော မှတ်တမ်းများ ရှာခြင်း
      const user = await this.prisma.user.findUnique({
        where: { telegramId },
        include: {
          bets: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!user || !user.bets || user.bets.length === 0) {
        return await ctx.reply('⚠️ သင်ထိုးထားတဲ့ မှတ်တမ်း မရှိသေးပါဘူးခင်ဗျာ။');
      }

      let historyMessage = `📝 <b>သင်၏ နောက်ဆုံးထိုးမှတ်တမ်း (၁၀) ခု</b>\n`;
      historyMessage += `━━━━━━━━━━━━━━━━━━\n`;

      user.bets.forEach((bet, index) => {
        const date = new Date(bet.createdAt).toLocaleString('en-US', {
          timeZone: 'Asia/Yangon',
          hour12: true, // AM/PM ထည့်ရန်
        });
        const statusEmoji =
          bet.status === 'WIN' ? '✅' : bet.status === 'LOSE' ? '❌' : '⏳';
        const statusText =
          bet.status === 'WIN'
            ? 'ပေါက်'
            : bet.status === 'LOSE'
              ? 'မပေါက်'
              : 'စောင့်ဆိုင်းဆဲ';

        historyMessage += `${index + 1}. 🎯 <b>${bet.number}</b> ${statusEmoji} (${statusText})\n (${bet.type})\n`;
        historyMessage += `   💰 ${Number(bet.amount)} MMK | 🕒 ${date}\n`;
        historyMessage += `━━━━━━━━━━━━━━━━━━\n`;
      });

      await ctx.reply(historyMessage, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('History Error:', error);
      await ctx.reply('❌ မှတ်တမ်းရှာဖွေရာတွင် အမှားအယွင်းရှိနေပါသည်။');
    }
  }

  // src/bot/bot.update.ts

  @Command('result')
  async onResult(@Ctx() ctx: BotContext) {
    // ၁။ Admin ဟုတ်မဟုတ် စစ်ဆေးခြင်း
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

    const [, type, winNumber] = (ctx.message as any).text.split(' '); // e.g., /result 2D 84

    if (!type || !winNumber) {
      return ctx.reply('⚠️ အသုံးပြုပုံ - /result [2D/3D] [ဂဏန်း]');
    }

    // ၂။ လက်ရှိ Session ကို သတ်မှတ်ခြင်း (မနက် သို့မဟုတ် ညနေ)
    const session = new Date().getHours() < 13 ? 'MORNING' : 'EVENING';

    // ၃။ ထိုးထားသမျှ PENDING ဖြစ်နေသော Bet များကို ရှာခြင်း
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
        // ✅ ပေါက်သောသူများ (Win Logic)
        const winAmount = Number(bet.amount) * (type === '2D' ? 8 : 80); // 2D=80 ဆ၊ 3D=500 ဆ

        await this.prisma.$transaction([
          this.prisma.user.update({
            where: { id: bet.userId },
            data: { balance: { increment: winAmount } },
          }),
          this.prisma.bet.update({
            where: { id: bet.id },
            data: { status: 'WIN' },
          }),
        ]);

        // User ထံသို့ အကြောင်းကြားစာပို့ခြင်း
        await this.bot.telegram.sendMessage(
          Number(bet.user.telegramId),
          `🎉 <b>ဂုဏ်ယူပါတယ်!</b>\n\nလူကြီးမင်းထိုးထားသော <b>${bet.number}</b> ဂဏန်း ပေါက်ပါသည်။\n💰 အနိုင်ရငွေ: <b>${winAmount} MMK</b> ကို လက်ကျန်ငွေထဲ ပေါင်းထည့်ပေးလိုက်ပါပြီ။`,
          { parse_mode: 'HTML' },
        );
        winCount++;
      } else {
        // ❌ မပေါက်သောသူများ (Lose Logic)
        await this.prisma.bet.update({
          where: { id: bet.id },
          data: { status: 'LOSE' },
        });

        await this.bot.telegram.sendMessage(
          Number(bet.user.telegramId),
          `😞 စိတ်မကောင်းပါဘူးခင်ဗျာ။\nယနေ့ထွက်ဂဏန်းမှာ <b>${winNumber}</b> ဖြစ်ပြီး လူကြီးမင်းထိုးထားသော <b>${bet.number}</b> မပေါက်ပါ။\nနောက်တစ်ကြိမ် ပြန်လည်ကံစမ်းပေးပါဦး။`,
          { parse_mode: 'HTML' },
        );
      }
    }

    await ctx.reply(
      `📊 Result ထုတ်ပြန်ပြီးပါပြီ \n\nဂဏန်း: ${winNumber}\nပေါက်သူစုစုပေါင်း: ${winCount} ဦး`,
    );
  }

  // --- Shop Flow ---

  @Hears('🛒 စျေးဝယ်မယ်')
  @Action('shop_main')
  async onShop(@Ctx() ctx: BotContext) {
    const categories = await this.productsService.getCategories();

    if (categories.length === 0) {
      // FIX: Add await and remove 'return' from the front of ctx.reply
      await ctx.reply(
        'လက်ရှိမှာ ဝယ်ယူလို့ရနိုင်တဲ့ ပစ္စည်း မရှိသေးပါဘူးခင်ဗျာ။',
      );
      return;
    }

    const buttons = categories.map((c) => [
      Markup.button.callback(c, `cat_${c}`),
    ]);

    const text = '📂 အမျိုးအစား တစ်ခု ရွေးချယ်ပေးပါခင်ဗျာ';

    if (ctx.callbackQuery) {
      // FIX: Add await and do not return the result
      await ctx.editMessageText(text, Markup.inlineKeyboard(buttons));
    } else {
      // FIX: Add await and do not return the result
      await ctx.reply(text, Markup.inlineKeyboard(buttons));
    }

    // Explicitly return nothing to prevent [object Object]
    return;
  }

  @Action(/^cat_(.+)$/)
  async onCategorySelect(@Ctx() ctx: BotContext) {
    // @ts-ignore
    const category = ctx.match[1];
    const products = await this.productsService.getProductsByCategory(category);

    const buttons = products.map((p) => [
      Markup.button.callback(`${p.name} - ${p.price} MMK`, `prod_${p.id}`),
    ]);
    buttons.push([
      Markup.button.callback('🔙 Back to Categories', 'shop_main'),
    ]);

    await ctx.editMessageText(
      `📂 အမျိုးအစား - ${category}\n\nအသေးစိတ်ကြည့်ရှုရန်အတွက် ပစ္စည်းတစ်ခုခုကို ရွေးချယ်ပေးပါခင်ဗျာ -`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      },
    );
  }

  @Action(/^prod_(.+)$/)
  async onProductSelect(@Ctx() ctx: BotContext) {
    // @ts-ignore
    const productId = parseInt(ctx.match[1]);

    await ctx.editMessageText(
      `❓ ဤပစ္စည်းကို ဝယ်ယူရန် သေချာပါသလား?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ ဝယ်ယူရန် အတည်ပြုသည်', `buy_${productId}`)],
        [Markup.button.callback('❌ မဝယ်တော့ပါ', 'shop_main')],
      ]),
    );
  }

  @Action(/^buy_(.+)$/)
  async onBuyConfirm(@Ctx() ctx: BotContext) {
    // @ts-ignore
    const productId = parseInt(ctx.match[1]);
    const userId = ctx.from.id;

    const dbUser = await this.usersService.findOrCreateUser(
      Number(userId),
      ctx.from.first_name,
    );

    try {
      const result = await this.productsService.purchaseProduct(
        dbUser.id,
        productId,
      );

      await ctx.deleteMessage();
      const successText =
        `✅ <b>ဝယ်ယူမှု အောင်မြင်ပါသည်!</b>\n\n` +
        `📦 <b>ဝယ်ယူသည့်ပစ္စည်း:</b> ${result.product.name}\n\n` +
        `🔑 <b>လူကြီးမင်း၏ Key:</b>\n` +
        `<code>${result.key}</code>\n\n` +
        `<i>(Key ကို တစ်ချက်နှိပ်ရုံဖြင့် Copy ကူးယူနိုင်ပါသည်)</i>\n\n` +
        `<i>မှတ်ချက်။ ။ ဤ Key ကို လုံခြုံစွာ သိမ်းဆည်းထားပေးပါခင်ဗျာ။</i>`;

      await ctx.reply(successText, { parse_mode: 'HTML' });
    } catch (error: any) {
      await ctx.answerCbQuery(error.message, { show_alert: true });
      await ctx.reply(`❌ Purchase failed: ${error.message}`);
    }
  }

  // --- Admin Actions ---

  @Action(/^approve_deposit_(.+)$/)
  async onApproveDeposit(@Ctx() ctx: BotContext) {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

    // @ts-ignore
    const depositId = parseInt(ctx.match[1]);
    try {
      // WalletService MUST use 'include: { user: true }' in its internal prisma call
      const deposit = await this.walletService.approveDeposit(
        depositId,
        ctx.from.id,
      );

      // 1. Update Admin UI
      const originalCaption = (ctx.callbackQuery.message as any).caption || '';
      await ctx.editMessageCaption(
        `${originalCaption}\n\n✅ <b>STATUS: APPROVED</b>`,
        { parse_mode: 'HTML' },
      );

      // 2. Notify User
      // We access .user.telegramId because we fixed the WalletService Prisma call
      const userTelegramId = Number(deposit.user.telegramId);

      await this.bot.telegram.sendMessage(
        userTelegramId,
        `✅ <b>ငွေဖြည့်သွင်းမှု အောင်မြင်သွားပါပြီ!</b>\n\n${deposit.amount}MMK ကိုလက်ကျန်ငွေထဲသို့ ပေါင်းထည့်ပေးပြီးပါပြီခင်ဗျာ။`,
        { parse_mode: 'HTML' },
      );

      await ctx.answerCbQuery('ငွေဖြည့်သွင်းမှု အောင်မြင်သွားပါပြီ');
    } catch (e: any) {
      await ctx.reply('Error: ' + e.message);
    }
  }

  @Action(/^reject_deposit_(.+)$/)
  async onRejectDeposit(@Ctx() ctx: BotContext) {
    // 1. Security Check
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

    // @ts-ignore
    const depositId = parseInt(ctx.match[1]);

    try {
      // 2. Reject in DB and get user info
      // WalletService.rejectDeposit MUST return the user object (include: { user: true })
      const deposit = await this.walletService.rejectDeposit(depositId);

      // 3. Update Admin UI (Remove buttons and show status)
      const originalCaption = (ctx.callbackQuery.message as any).caption || '';
      await ctx.editMessageCaption(
        `${originalCaption}\n\n❌ <b>STATUS: REJECTED</b>`,
        { parse_mode: 'HTML' },
      );

      // 4. Send Message to the User
      const userTelegramId = Number(deposit.user.telegramId);
      await this.bot.telegram.sendMessage(
        userTelegramId,
        `❌ <b>Deposit Rejected</b>\n\nစိတ်မကောင်းပါဘူးခင်ဗျာ၊ လူကြီးမင်း ပေးပို့ထားတဲ့ ${deposit.amount} MMK ငွေဖြည့်သွင်းမှုကို အက်ဒမင် (Admin) က လက်မခံပါဘူး။ တစ်စုံတစ်ရာ မှားယွင်းမှု ရှိနေတယ်လို့ ထင်မြင်ပါက အကူအညီ (Support)ဆီကို ဆက်သွယ်ပေးပါခင်ဗျာ`,
        { parse_mode: 'HTML' },
      );

      await ctx.answerCbQuery('User notified of rejection.');
    } catch (e: any) {
      await ctx.reply('Error: ' + e.message);
    }
  }

  @Hears('📞 အကူအညီ')
  async onSupport(@Ctx() ctx: BotContext) {
    const supportText =
      `📞 <b>အကူအညီ လိုအပ်ပါသလား?</b>\n\n` +
      `နည်းပညာပိုင်းဆိုင်ရာ အခက်အခဲများ သို့မဟုတ် သိရှိလိုသည်များကို အောက်ပါ Admin ဆီမှာ တိုက်ရိုက် မေးမြန်းနိုင်ပါတယ်ခင်ဗျာ။\n\n` +
      `👤 <b>Contact:</b> @Prototype004905`;

    await ctx.reply(supportText, { parse_mode: 'HTML' });
  }

  // --- Withdraw Admin Actions ---

  @Action(/^approve_withdraw_(.+)$/)
  async onApproveWithdraw(@Ctx() ctx: BotContext) {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

    // @ts-ignore
    const withdrawId = parseInt(ctx.match[1]);

    try {
      const withdraw = await this.prisma.withdraw.update({
        where: { id: withdrawId },
        data: { status: 'APPROVED' },
        include: { user: true },
      });

      // Admin UI Update
      const originalText = (ctx.callbackQuery.message as any).text || '';
      await ctx.editMessageText(
        `${originalText}\n\n✅ <b>STATUS: APPROVED (ငွေလွှဲပြီး)</b>`,
        { parse_mode: 'HTML' },
      );

      // User ထံ Notification ပို့ခြင်း
      await this.bot.telegram.sendMessage(
        Number(withdraw.user.telegramId),
        `✅ <b>ငွေထုတ်ယူမှု အောင်မြင်ပါသည်!</b>\n\nလူကြီးမင်း ထုတ်ယူထားသော ${withdraw.amount} MMK ကို ${withdraw.method} (${withdraw.phoneNumber}) သို့ လွှဲပြောင်းပေးပြီးပါပြီ။`,
        { parse_mode: 'HTML' },
      );

      await ctx.answerCbQuery('Withdrawal Approved');
    } catch (e: any) {
      await ctx.reply('Error: ' + e.message);
    }
  }

  @Action(/^reject_withdraw_(.+)$/)
  async onRejectWithdraw(@Ctx() ctx: BotContext) {
    if (ctx.from.id.toString() !== process.env.ADMIN_ID) return;

    // @ts-ignore
    const withdrawId = parseInt(ctx.match[1]);

    try {
      // Transaction သုံးပြီး Status ပြောင်းမယ်၊ ပိုက်ဆံကို Refund ပြန်ပေးမယ်
      const withdraw = await this.prisma.withdraw.findUnique({
        where: { id: withdrawId },
        include: { user: true },
      });

      if (!withdraw || withdraw.status !== 'PENDING') {
        return ctx.answerCbQuery('ဤတောင်းဆိုမှုသည် သက်တမ်းကုန်ဆုံးသွားပါပြီ။');
      }

      await this.prisma.$transaction([
        // ၁။ User ဆီ ပိုက်ဆံပြန်ပေါင်းပေးခြင်း
        this.prisma.user.update({
          where: { id: withdraw.userId },
          data: { balance: { increment: withdraw.amount } },
        }),
        // ၂။ Status ကို Reject ပြောင်းခြင်း
        this.prisma.withdraw.update({
          where: { id: withdrawId },
          data: { status: 'REJECTED' },
        }),
      ]);

      // Admin UI Update
      const originalText = (ctx.callbackQuery.message as any).text || '';
      await ctx.editMessageText(
        `${originalText}\n\n❌ <b>STATUS: REJECTED (ငြင်းပယ်လိုက်သည်)</b>`,
        { parse_mode: 'HTML' },
      );

      // User ထံ Notification ပို့ခြင်း
      await this.bot.telegram.sendMessage(
        Number(withdraw.user.telegramId),
        `❌ <b>ငွေထုတ်ယူမှု ငြင်းပယ်ခံရသည်</b>\n\nလူကြီးမင်း၏ ${withdraw.amount} MMK ထုတ်ယူမှုကို Admin မှ ငြင်းပယ်လိုက်ပါသည်။ နှုတ်ယူထားသော ပိုက်ဆံကို လူကြီးမင်း၏ Balance ထဲသို့ ပြန်လည် ထည့်သွင်းပေးလိုက်ပါပြီ။`,
        { parse_mode: 'HTML' },
      );

      await ctx.answerCbQuery('Withdrawal Rejected & Refunded');
    } catch (e: any) {
      await ctx.reply('Error: ' + e.message);
    }
  }
}
