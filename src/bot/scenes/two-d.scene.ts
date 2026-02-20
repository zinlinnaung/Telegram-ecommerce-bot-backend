import { Scene, SceneEnter, On, Ctx, Action } from 'nestjs-telegraf';
import { BotContext } from 'src/interfaces/bot-context.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { Markup } from 'telegraf';
import { MAIN_KEYBOARD } from '../bot.update';

@Scene('scene_2d')
export class TwoDScene {
  private readonly MIN_BET = 500;
  private readonly GLOBAL_LIMIT_PER_NUMBER = 500000; // တစ်လုံးကို အများဆုံး ၅ သိန်း MMK
  private readonly BLOCKED_NUMBERS = ['00', '99', '11']; // ပိတ်ဂဏန်းများ

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Real-world 2D Session Logic
   * နံနက်ပိုင်း: 08:00 AM မှ 11:55 AM ထိ
   * ညနေပိုင်း: 01:00 PM မှ 04:25 PM ထိ
   */
  private getSessionInfo() {
    const now = new Date();
    const mmTime = new Date(
      now.toLocaleString('en-US', { timeZone: 'Asia/Yangon' }),
    );
    const hour = mmTime.getHours();
    const min = mmTime.getMinutes();
    const currentTime = hour * 100 + min;

    // Morning Session (08:00 - 11:55)
    if (currentTime >= 800 && currentTime < 1155) {
      return { isOpen: true, session: 'MORNING' as const, message: '' };
    }

    // Evening Session (13:00 - 16:25)
    if (currentTime >= 1300 && currentTime < 1625) {
      return { isOpen: true, session: 'EVENING' as const, message: '' };
    }

    // Closed Status & Informative Messages
    let message = '⚠️ လက်ရှိ 2D ထိုးချိန် မဟုတ်သေးပါ။';
    if (currentTime >= 1155 && currentTime < 1300) {
      message =
        '⚠️ 2D နံနက်ပိုင်း ပိတ်သွားပါပြီ။ နေ့လယ် ၁:၀၀ နာရီတွင် ညနေပိုင်းအတွက် ပြန်ဖွင့်ပါမည်။';
    } else if (currentTime >= 1625) {
      message =
        '⚠️ 2D ယနေ့အတွက် ပိတ်သွားပါပြီ။ မနက်ဖြန် နံနက် ၈:၀၀ နာရီတွင် ပြန်ဖွင့်ပါမည်။';
    } else if (currentTime < 800) {
      message = '⚠️ 2D နံနက် ၈:၀၀ နာရီမှသာ စတင်ဖွင့်လှစ်ပါမည်။';
    }

    return { isOpen: false, session: null, message };
  }

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    const { isOpen, message } = this.getSessionInfo();

    if (!isOpen) {
      await ctx.reply(message);
      return ctx.scene.leave();
    }

    await ctx.reply(
      '🎰 <b>2D ထိုးမည်</b>\n\n' +
        '• ဂဏန်းခွဲရိုက်ပါ (e.g., 12-2000 45r-1000)\n' +
        '• တစ်ကွက်ချင်းစီအတွက် Limit ရှိနိုင်ပါသည်။',
      {
        parse_mode: 'HTML',
        ...Markup.keyboard([['🏠 ပင်မစာမျက်နှာ']]).resize(),
      },
    );
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext) {
    const { isOpen, message } = this.getSessionInfo();
    if (!isOpen) {
      await ctx.reply(message);
      return ctx.scene.leave();
    }

    const input = (ctx.message as any).text.trim().toLowerCase();
    const state = ctx.scene.state as any;

    // Exit Logic
    if (input === '🏠 ပင်မစာမျက်နှာ' || input === 'exit') {
      await ctx.scene.leave();
      await ctx.reply('🏠 ပင်မစာမျက်နှာသို့ ပြန်ရောက်ပါပြီ။', {
        parse_mode: 'HTML',
        ...MAIN_KEYBOARD,
      });
      return;
    }

    // Parsing Input
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

        // 2. Limit Check
        if (amount !== undefined) {
          if (amount < this.MIN_BET) {
            await ctx.reply(`❌ အနည်းဆုံး ${this.MIN_BET} ကျပ် ဖြစ်ရပါမည်။`);
            return;
          }
          if (amount > this.GLOBAL_LIMIT_PER_NUMBER) {
            await ctx.reply(
              `❌ အများဆုံး ${this.GLOBAL_LIMIT_PER_NUMBER.toLocaleString()} MMK သာ ထိုးနိုင်ပါသည်။`,
            );
            return;
          }
        }

        // 3. R (Reverse) Logic
        if (rawNum.endsWith('r')) {
          const num = rawNum.replace('r', '');
          const rev = num.split('').reverse().join('');
          entries.push({ number: num, amount });
          if (num !== rev) entries.push({ number: rev, amount });
        } else if (/^\d{2}$/.test(rawNum)) {
          entries.push({ number: rawNum, amount });
        }
      }

      if (entries.length === 0) {
        return ctx.reply('❌ ဂဏန်းပုံစံ မှားယွင်းနေပါသည်။ (e.g., 12-1000)');
      }
      state.betEntries = entries;
    } else {
      // Manual amount input if only numbers were provided initially
      const amount = parseInt(input);
      if (isNaN(amount) || amount < this.MIN_BET) {
        return ctx.reply(`❌ အနည်းဆုံး ${this.MIN_BET} ကျပ် ရိုက်ပါ။`);
      }
      state.betEntries = state.betEntries.map((e: any) => ({
        ...e,
        amount: e.amount ?? amount,
      }));
    }

    const allHavePrice = state.betEntries.every(
      (e: any) => e.amount !== undefined,
    );
    if (allHavePrice) return this.showConfirmation(ctx);

    await ctx.reply(
      `🎯 ဂဏန်း: <b>${state.betEntries.map((e: any) => e.number).join(', ')}</b>\n\nမည်မျှဖိုး ထိုးမည်နည်း?`,
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

    state.betEntries = state.betEntries.map((e: any) => ({
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

    state.betEntries.forEach((e: any) => {
      total += e.amount;
      summary += `• <b>${e.number}</b> 👉 ${e.amount.toLocaleString()} MMK\n`;
    });
    state.totalAmount = total;

    await ctx.reply(
      `📝 <b>ထိုးမည့်စာဉ်း အကျဉ်းချုပ်</b>\n\n${summary}\n💰 စုစုပေါင်း: <b>${total.toLocaleString()} MMK</b>\n\nအတည်ပြုပါသလား?`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ အတည်ပြုမည်', 'confirm_bet')],
          [Markup.button.callback('❌ ဖျက်သိမ်းမည်', 'cancel_bet')],
        ]),
      },
    );
  }

  @Action('confirm_bet')
  async handleConfirm(@Ctx() ctx: BotContext) {
    const { isOpen, session } = this.getSessionInfo();
    if (!isOpen) {
      await ctx.answerCbQuery('⚠️ ဆောရီး၊ ပိတ်သွားပါပြီ။', {
        show_alert: true,
      });
      return ctx.scene.leave();
    }
    await ctx.answerCbQuery('Stock စစ်ဆေးနေပါသည်...');
    return this.processFinalBet(ctx, session!);
  }

  @Action('cancel_bet')
  async handleCancel(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await ctx.editMessageText('❌ ဖျက်သိမ်းလိုက်ပါသည်။');
    return ctx.scene.leave();
  }

  private async processFinalBet(
    ctx: BotContext,
    session: 'MORNING' | 'EVENING',
  ) {
    const state = ctx.scene.state as any;

    try {
      // 1. Stock Check
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
          delete state.betEntries;
          return ctx.reply(
            `❌ ဂဏန်း <b>${bet.number}</b> မှာ Limit ပြည့်သွားပါပြီ။\nလက်ကျန် Stock: <b>${available > 0 ? available : 0}</b> MMK သာ ရှိပါတော့သည်။`,
            { parse_mode: 'HTML' },
          );
        }
      }

      // 2. Balance Check
      const dbUser = await this.prisma.user.findUnique({
        where: { telegramId: BigInt(ctx.from!.id) },
      });

      if (!dbUser || Number(dbUser.balance) < state.totalAmount) {
        return ctx.reply('❌ လက်ကျန်ငွေ မလုံလောက်ပါ။');
      }

      // 3. Transactional Update
      await this.prisma.$transaction(async (tx) => {
        // Increment Balance
        await tx.user.update({
          where: { id: dbUser.id },
          data: { balance: { decrement: state.totalAmount } },
        });

        // Create Bets
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
        `✅ <b>အောင်မြင်ပါသည်။</b>\nSession: ${session}\nစုစုပေါင်း: ${state.totalAmount.toLocaleString()} MMK`,
        { parse_mode: 'HTML' },
      );
    } catch (e) {
      console.error(e);
      await ctx.reply('❌ စနစ်ချို့ယွင်းချက် ဖြစ်ပေါ်ခဲ့ပါသည်။');
    }
    return ctx.scene.leave();
  }
}
