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
  ['🎮 ဂိမ်းကစားမယ်'], // This is your new Category
  ['🛒 စျေးဝယ်မယ်', '💰 လက်ကျန်ငွေ'],
  ['➕ ငွေဖြည့်မယ်', '💸 ငွေထုတ်မယ်'],
  ['📞 အကူအညီ'],
]).resize();
export const GAME_KEYBOARD = Markup.keyboard([
  ['🎰 2D ထိုးမယ်', '🎲 3D ထိုးမယ်'],
  ['🎲 အနိမ့်/အမြင့်', '📝 ထိုးမှတ်တမ်း'],
  ['🏠 ပင်မစာမျက်နှာ'], // To go back to main menu
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
    const welcomeText = `👋 <b>Welcome ${user.firstName}!</b>\n\n💰လူကြီးမင်းရဲ့ လက်ရှိလက်ကျန်ငွေ: <b>${user.balance}MMK</b> ဖြစ်ပါတယ်`;

    await ctx.reply(welcomeText, {
      parse_mode: 'HTML', // Change this from 'Markdown' to 'HTML'
      ...MAIN_KEYBOARD,
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

  @Hears('🎮 ဂိမ်းကစားမယ်')
  async onPlayGameMenu(@Ctx() ctx: BotContext) {
    await ctx.reply('🎮 ကစားလိုသည့် ဂိမ်းအမျိုးအစားကို ရွေးချယ်ပေးပါခင်ဗျာ -', {
      ...GAME_KEYBOARD,
    });
  }

  @Hears('🏠 ပင်မစာမျက်နှာ')
  async onHome(@Ctx() ctx: BotContext) {
    try {
      await ctx.scene.leave();
    } catch (e) {}

    const user = await this.usersService.findOrCreateUser(
      Number(ctx.from.id),
      ctx.from.first_name,
      ctx.from.username,
    );

    await ctx.reply(
      `🏠 <b>ပင်မစာမျက်နှာသို့ ပြန်ရောက်ပါပြီ။</b>\n\n💰 လက်ရှိလက်ကျန်ငွေ: <b>${user.balance} MMK</b>`,
      {
        parse_mode: 'HTML',
        ...MAIN_KEYBOARD, // Show the Main Menu again
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
    // Web App ရဲ့ URL (ဥပမာ - https://your-game-app.web.app/high-low)
    // .env ထဲမှာ WEB_APP_URL ဆိုပြီး သိမ်းထားတာ ပိုကောင်းပါတယ်
    const webAppUrl = `https://bot-admin-dashboard.vercel.app/game`;

    await ctx.reply(
      '🎲 <b>High/Low Game (အနိမ့်/အမြင့်)</b>\n\n' +
        'ကံစမ်းရန်အတွက် အောက်ပါ <b>Play Game</b> ခလုတ်ကို နှိပ်ပြီးကစားနိုင်ပါပြီခင်ဗျာ။',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            // 💡 ဤနေရာတွင် Web App ခလုတ်ကို ထည့်သွင်းထားသည်
            Markup.button.webApp('🎮 Play Game (ကစားမည်)', webAppUrl),
          ],
          [Markup.button.callback('🏠 ပင်မစာမျက်နှာ', 'go_main')],
        ]),
      },
    );
  }

  // BotUpdate class ရဲ့ အောက်နားတစ်နေရာမှာ ထည့်ပါ
  @Action('go_main')
  async onGoMainAction(@Ctx() ctx: BotContext) {
    // ၁။ လက်ရှိ Inline Keyboard ပါတဲ့ message ကို ဖျက်လိုက်မယ် (Optionally)
    try {
      await ctx.deleteMessage();
    } catch (e) {
      // message ဖျက်မရရင် ignore လုပ်မယ်
    }

    // ၂။ ပင်မစာမျက်နှာကို ပြန်ပို့မယ် (onHome function ကို ပြန်ခေါ်သလိုမျိုး)
    const user = await this.usersService.findOrCreateUser(
      Number(ctx.from.id),
      ctx.from.first_name,
      ctx.from.username,
    );

    await ctx.reply(
      `🏠 <b>ပင်မစာမျက်နှာသို့ ပြန်ရောက်ပါပြီ။</b>\n\n💰 လက်ရှိလက်ကျန်ငွေ: <b>${user.balance} MMK</b>`,
      {
        parse_mode: 'HTML',
        ...MAIN_KEYBOARD,
      },
    );

    // ၃။ Loading icon လေး ပျောက်သွားအောင် answer ပေးရပါမယ်
    await ctx.answerCbQuery();
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

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    // CHECK IF MANUAL (GAME) OR AUTO (KEY)
    if (product.type === 'MANUAL') {
      // Enter the Scene for MLBB/PUBG
      await ctx.deleteMessage(); // Clean up menu
      // @ts-ignore
      await ctx.scene.enter('game_purchase_scene', { productId });
      return;
    }

    // EXISTING LOGIC FOR KEYS/AUTO
    await ctx.editMessageText(
      `❓ ဤပစ္စည်းကို ဝယ်ယူရန် သေချာပါသလား?\n\n📦 ${product.name}\n💰 ${product.price} MMK`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ ဝယ်ယူရန် အတည်ပြုသည်', `buy_${productId}`)],
        [Markup.button.callback('❌ မဝယ်တော့ပါ', 'shop_main')],
      ]),
    );
  }

  // ------------------------------------------
  // 2. ADD THESE NEW ADMIN ACTIONS
  // ------------------------------------------

  @Action(/^order_done_(.+)$/)
  async onOrderDone(@Ctx() ctx: BotContext) {
    // @ts-ignore
    const purchaseId = parseInt(ctx.match[1]);

    try {
      const purchase = await this.prisma.purchase.update({
        where: { id: purchaseId },
        data: { status: 'COMPLETED' },
        include: { user: true, product: true },
      });

      // Update Admin Message
      const originalText = (ctx.callbackQuery.message as any).text;
      await ctx.editMessageText(
        `${originalText}\n\n✅ <b>COMPLETED by ${ctx.from.first_name}</b>`,
        { parse_mode: 'HTML' },
      );

      // Notify User
      await ctx.telegram.sendMessage(
        Number(purchase.user.telegramId),
        `✅ <b>Successful!</b>\n\nလူကြီးမင်း ဝယ်ယူထားသော <b>${purchase.product.name}</b> ကို ဂိမ်းအကောင့်ထဲသို့ ထည့်သွင်းပေးလိုက်ပါပြီ။`,
        { parse_mode: 'HTML' },
      );

      await ctx.answerCbQuery('Marked as Done');
    } catch (e) {
      console.error(e);
      await ctx.answerCbQuery('Error updating order');
    }
  }

  @Action(/^order_reject_(.+)$/)
  async onOrderReject(@Ctx() ctx: BotContext) {
    // @ts-ignore
    const purchaseId = parseInt(ctx.match[1]);

    try {
      const purchase = await this.prisma.purchase.findUnique({
        where: { id: purchaseId },
      });

      if (purchase.status !== 'PENDING')
        return ctx.answerCbQuery('Already processed');

      // Refund and Reject Transaction
      await this.prisma.$transaction([
        this.prisma.purchase.update({
          where: { id: purchaseId },
          data: { status: 'REJECTED' },
        }),
        this.prisma.user.update({
          where: { id: purchase.userId },
          data: { balance: { increment: purchase.amount } },
        }),
        this.prisma.transaction.create({
          data: {
            userId: purchase.userId,
            amount: purchase.amount,
            type: 'REFUND',
            description: `Order Refund: ${purchaseId}`,
          },
        }),
      ]);

      // Update Admin Message
      const originalText = (ctx.callbackQuery.message as any).text;
      await ctx.editMessageText(
        `${originalText}\n\n❌ <b>REJECTED & REFUNDED by ${ctx.from.first_name}</b>`,
        { parse_mode: 'HTML' },
      );

      // Notify User
      const user = await this.prisma.user.findUnique({
        where: { id: purchase.userId },
      });
      await ctx.telegram.sendMessage(
        Number(user.telegramId),
        `❌ <b>Order Cancelled</b>\n\nလူကြီးမင်း၏ Order ကို Admin မှ ပယ်ဖျက်လိုက်ပါသည်။\nငွေ ${purchase.amount} MMK ကို Balance ထဲသို့ ပြန်ထည့်ပေးထားပါသည်။`,
        { parse_mode: 'HTML' },
      );

      await ctx.answerCbQuery('Order Rejected & Refunded');
    } catch (e) {
      console.error(e);
      await ctx.answerCbQuery('Error rejecting order');
    }
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

        this.prisma.transaction.create({
          data: {
            userId: withdraw.userId,
            amount: withdraw.amount,
            type: 'REFUND',
            description: `ငွေထုတ်ယူမှု ပယ်ဖျက်ခြင်း (Refund) - #${withdrawId}`,
          },
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
