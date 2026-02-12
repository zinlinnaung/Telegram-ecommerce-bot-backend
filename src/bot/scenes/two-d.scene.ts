import { Scene, SceneEnter, On, Ctx, Action } from 'nestjs-telegraf';
import { BotContext } from 'src/interfaces/bot-context.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { Markup } from 'telegraf';

@Scene('scene_2d')
export class TwoDScene {
  private readonly MIN_BET = 500;
  // Admin Settings (ဒါတွေကို Database ကနေလည်း ဆွဲယူနိုင်ပါတယ်)
  private readonly GLOBAL_LIMIT_PER_NUMBER = 500000; // ဂဏန်းတစ်လုံးကို စုစုပေါင်း ၅ သိန်းပဲလက်ခံမည်
  private readonly BLOCKED_NUMBERS = ['00', '99', '11']; // ပိတ်ဂဏန်းများ

  constructor(private readonly prisma: PrismaService) {}

  private isClosed() {
    const now = new Date();
    const mmTime = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Yangon' }),
    );
    const currentTime = mmTime.getHours() * 100 + mmTime.getMinutes();
    return (
      (currentTime >= 1155 && currentTime < 1201) ||
      (currentTime >= 1625 && currentTime < 1631)
    );
  }

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    if (this.isClosed()) {
      await ctx.reply('⚠️ 2D ပိတ်သွားပါပြီ။');
      return ctx.scene.leave();
    }
    await ctx.reply(
      '🎰 <b>2D ထိုးမည် (Limits & Stock Check)</b>\n\n' +
        '• ဂဏန်းခွဲရိုက်ပါ (e.g., 12-2000 45r-1000 76-1000)\n' +
        '• တစ်ကွက်ချင်းစီအတွက် Limit ရှိနိုင်ပါသည်။',
      {
        parse_mode: 'HTML',
        ...Markup.keyboard([['🏠 ပင်မစာမျက်နှာ']]).resize(),
      },
    );
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext) {
    const input = (ctx.message as any).text.trim().toLowerCase();
    const state = ctx.scene.state as any;

    if (input === '🏠 ပင်မစာမျက်နှာ' || input === 'exit') {
      await ctx.scene.leave();
      await ctx.reply(
        '🏠 ပင်မစာမျက်နှာသို့ ပြန်ရောက်ပါပြီ။',
        Markup.keyboard([
          ['🎰 2D ထိုးမယ်', '🎲 3D ထိုးမယ်'],
          ['🎲 အနိမ့်/အမြင့်', '🛒 စျေးဝယ်မယ်'],
          ['💰 လက်ကျန်ငွေ', '➕ ငွေဖြည့်မယ်'],
          ['📝 ထိုးမှတ်တမ်း', '💸 ငွေထုတ်မယ်'],
          ['📞 အကူအညီ'],
        ]).resize(),
      );

      return;
    }

    if (!state.betEntries) {
      const parts = input.split(/[\s,]+/);
      const entries: { number: string; amount?: number }[] = [];

      for (const part of parts) {
        const [rawNum, rawAmount] = part.split(/[-/]/);
        const amount = rawAmount ? parseInt(rawAmount) : undefined;
        const numOnly = rawNum.replace('r', '');

        // 1. Block List Check
        if (this.BLOCKED_NUMBERS.includes(numOnly)) {
          await ctx.reply(
            `❌ ဂဏန်း <b>${numOnly}</b> သည် ယနေ့အတွက် ပိတ်ထားပါသည်။`,
            { parse_mode: 'HTML' },
          );
          return;
        }

        // --- FIXED: Individual Limit Check during Parsing ---
        if (amount !== undefined) {
          if (amount < this.MIN_BET) {
            await ctx.reply(`❌ အနည်းဆုံး ${this.MIN_BET} ကျပ် ဖြစ်ရပါမည်။`);
            return;
          }
          if (amount > this.GLOBAL_LIMIT_PER_NUMBER) {
            await ctx.reply(
              `❌ ဂဏန်း <b>${numOnly}</b> အတွက် Limit သည် <b>${this.GLOBAL_LIMIT_PER_NUMBER.toLocaleString()}</b> MMK သာ ဖြစ်ပါသည်။`,
              { parse_mode: 'HTML' },
            );
            return;
          }
        }

        if (rawNum.endsWith('r')) {
          const num = rawNum.replace('r', '');
          const rev = num.split('').reverse().join('');
          entries.push({ number: num, amount });
          if (num !== rev) entries.push({ number: rev, amount });
        } else if (/^\d{2}$/.test(rawNum)) {
          entries.push({ number: rawNum, amount });
        }
      }
      state.betEntries = entries;
    } else {
      const amount = parseInt(input);
      // --- FIXED: Limit Check for manual amount input ---
      if (isNaN(amount) || amount < this.MIN_BET) {
        return ctx.reply(`❌ အနည်းဆုံး ${this.MIN_BET} ကျပ် ရိုက်ပါ။`);
      }
      if (amount > this.GLOBAL_LIMIT_PER_NUMBER) {
        return ctx.reply(
          `❌ Limit ကျော်လွန်နေပါသည်။ အများဆုံး ${this.GLOBAL_LIMIT_PER_NUMBER.toLocaleString()} အထိသာ ရိုက်ပါ။`,
        );
      }
      state.betEntries = state.betEntries.map((e) => ({
        ...e,
        amount: e.amount ?? amount,
      }));
    }

    const allHavePrice = state.betEntries.every((e) => e.amount !== undefined);
    if (allHavePrice) return this.showConfirmation(ctx);

    await ctx.reply(
      `🎯 ဂဏန်း: <b>${state.betEntries.map((e) => e.number).join(', ')}</b>\n\nမည်မျှဖိုး ထိုးမည်နည်း?`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('500', 'amt_500'),
            Markup.button.callback('1000', 'amt_1000'),
          ],
          [
            Markup.button.callback('5000', 'amt_5000'),
            Markup.button.callback('10000', 'amt_10000'),
          ],
        ]),
      },
    );
  }

  @Action(/amt_(\d+)/)
  async handleAmountAction(@Ctx() ctx: BotContext) {
    const amount = parseInt((ctx as any).match[1]);
    const state = ctx.scene.state as any;

    // Safety check for button clicks as well
    if (amount > this.GLOBAL_LIMIT_PER_NUMBER) {
      return ctx.answerCbQuery(
        `Limit သည် ${this.GLOBAL_LIMIT_PER_NUMBER} သာရှိပါသည်`,
        { show_alert: true },
      );
    }

    state.betEntries = state.betEntries.map((e) => ({
      ...e,
      amount: e.amount ?? amount,
    }));
    await ctx.answerCbQuery();
    return this.showConfirmation(ctx);
  }

  private async showConfirmation(ctx: BotContext) {
    const state = ctx.scene.state as any;
    let total = 0;
    let summary = '';
    state.betEntries.forEach((e) => {
      total += e.amount;
      summary += `• <b>${e.number}</b> 👉 ${e.amount.toLocaleString()} MMK\n`;
    });
    state.totalAmount = total;

    await ctx.reply(
      `📝 <b>ထိုးမည့်စာရင်း အကျဉ်းချုပ်</b>\n\n${summary}\n💰 စုစုပေါင်း: <b>${total.toLocaleString()} MMK</b>\n\nအတည်ပြုပါသလား?`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ အတည်ပြုမည်', 'confirm_bet')],
          [Markup.button.callback('❌ ဖျက်သိမ်းမည်', 'cancel_bet')],
        ]),
      },
    );

    return;
  }

  @Action('confirm_bet')
  async handleConfirm(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery('Stock စစ်ဆေးနေပါသည်...');
    return this.processFinalBet(ctx);
  }

  @Action('cancel_bet')
  async handleCancel(@Ctx() ctx: BotContext) {
    await ctx.editMessageText('❌ ဖျက်သိမ်းလိုက်ပါသည်။');
    return ctx.scene.leave();
  }

  private async processFinalBet(ctx: BotContext) {
    const state = ctx.scene.state as any;
    const session = new Date().getHours() < 13 ? 'MORNING' : 'EVENING';

    try {
      // --- 2. Real-time Stock Check Logic ---
      for (const bet of state.betEntries) {
        const currentTotal = await this.prisma.bet.aggregate({
          where: {
            number: bet.number,
            session,
            type: '2D',
            createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
          _sum: { amount: true },
        });

        const alreadyBet = Number(currentTotal._sum.amount || 0);
        if (alreadyBet + bet.amount > this.GLOBAL_LIMIT_PER_NUMBER) {
          const available = this.GLOBAL_LIMIT_PER_NUMBER - alreadyBet;
          // Clean state so user can retry
          delete state.betEntries;
          return ctx.reply(
            `❌ ဂဏန်း <b>${bet.number}</b> မှာ Limit ပြည့်သွားပါပြီ။\nလက်ကျန် Stock: <b>${available > 0 ? available : 0}</b> MMK သာ ရှိပါတော့သည်။`,
            { parse_mode: 'HTML' },
          );
        }
      }

      // --- 3. Transaction Safety ---
      const dbUser = await this.prisma.user.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
      });
      if (!dbUser || Number(dbUser.balance) < state.totalAmount)
        return ctx.reply('❌ လက်ကျန်ငွေ မလုံလောက်ပါ။');

      await this.prisma.$transaction(async (tx) => {
        // ငွေနှုတ်ခြင်း
        await tx.user.update({
          where: { id: dbUser.id },
          data: { balance: { decrement: state.totalAmount } },
        });

        // စာရင်းသွင်းခြင်း
        for (const bet of state.betEntries) {
          await tx.bet.create({
            data: {
              userId: dbUser.id,
              type: '2D',
              number: bet.number,
              amount: bet.amount,
              session: session,
            },
          });
        }
      });

      await ctx.editMessageText(
        `✅ <b>အောင်မြင်ပါသည်။</b>\nစုစုပေါင်း: ${state.totalAmount.toLocaleString()} MMK`,
        { parse_mode: 'HTML' },
      );
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ စနစ်ချို့ယွင်းချက် ဖြစ်ပေါ်ခဲ့ပါသည်။');
    }
    return ctx.scene.leave();
  }
}
