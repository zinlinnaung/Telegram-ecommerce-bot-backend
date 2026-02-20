import { Scene, SceneEnter, On, Ctx, Action } from 'nestjs-telegraf';
import { BotContext } from 'src/interfaces/bot-context.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { Markup } from 'telegraf';
import { MAIN_KEYBOARD } from '../bot.update';

@Scene('scene_2d')
export class TwoDScene {
  private readonly MIN_BET = 500; // <--- အနည်းဆုံးထိုးငွေ သတ်မှတ်ချက်
  private readonly GLOBAL_LIMIT_PER_NUMBER = 500000;
  private readonly BLOCKED_NUMBERS = ['00', '99'];

  constructor(private readonly prisma: PrismaService) {}

  private getSessionInfo() {
    const mmTime = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon' }),
    );
    const hour = mmTime.getHours();
    const min = mmTime.getMinutes();
    const currentTime = hour * 100 + min;

    if (currentTime >= 800 && currentTime < 1155)
      return { isOpen: true, session: 'MORNING' as const };
    if (currentTime >= 1300 && currentTime < 1625)
      return { isOpen: true, session: 'EVENING' as const };

    return {
      isOpen: false,
      session: null,
      message: '⚠️ လက်ရှိ 2D ပိတ်ထားပါသည်။',
    };
  }

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    const { isOpen, message } = this.getSessionInfo();
    // if (!isOpen) {
    //   await ctx.reply(message);
    //   return ctx.scene.leave();
    // }

    await ctx.reply(
      `🎰 <b>2D ထိုးမည်</b>\n\n` +
        `• အနည်းဆုံးထိုးငွေ: <b>${this.MIN_BET} MMK</b>\n` +
        `• ရိုက်နည်း: <code>12.13-1000</code>, <code>pue-500</code>`,
      {
        parse_mode: 'HTML',
        ...Markup.keyboard([['🏠 ပင်မစာမျက်နှာ']]).resize(),
      },
    );
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext) {
    const input = (ctx.message as any).text.trim().toLowerCase();
    if (input === '🏠 ပင်မစာမျက်နှာ' || input === 'exit') {
      await ctx.scene.leave();
      return ctx.reply('🏠 ပြန်ရောက်ပါပြီ။', MAIN_KEYBOARD);
    }

    const entries = this.parseInput(input);
    if (entries.length === 0)
      return ctx.reply('❌ ပုံစံမှားနေပါသည်။ (e.g. 12.45r-1000)');

    // ၁။ MIN_BET စစ်ဆေးခြင်း
    for (const entry of entries) {
      if (entry.amount < this.MIN_BET) {
        return ctx.reply(
          `❌ အနည်းဆုံး <b>${this.MIN_BET.toLocaleString()} MMK</b> ထိုးရပါမည်။\n(သင်ရိုက်ခဲ့သည် - ${entry.number} ကို ${entry.amount} ကျပ်)`,
          { parse_mode: 'HTML' },
        );
      }
      // ၂။ ပိတ်ဂဏန်းစစ်ဆေးခြင်း
      if (this.BLOCKED_NUMBERS.includes(entry.number)) {
        return ctx.reply(
          `❌ <b>${entry.number}</b> သည် ယနေ့အတွက် ပိတ်ဂဏန်းဖြစ်ပါသည်။`,
          { parse_mode: 'HTML' },
        );
      }
    }

    const state = ctx.scene.state as any;
    state.betEntries = entries;
    state.totalAmount = entries.reduce((sum, e) => sum + e.amount, 0);

    return this.showConfirmation(ctx);
  }

  private parseInput(input: string) {
    const entries: { number: string; amount: number }[] = [];
    const blocks = input.split(/[\s\n]+/);

    for (const block of blocks) {
      const match = block.match(/^([a-z\d.,]+)[-/](\d+)$/);
      if (!match) continue;

      const rawNums = match[1].split(/[.,]/);
      const amount = parseInt(match[2]);

      for (let n of rawNums) {
        if (n === 'pue') {
          ['00', '11', '22', '33', '44', '55', '66', '77', '88', '99'].forEach(
            (num) => entries.push({ number: num, amount }),
          );
        } else if (n === 'pow') {
          ['05', '50', '16', '61', '27', '72', '38', '83', '49', '94'].forEach(
            (num) => entries.push({ number: num, amount }),
          );
        } else if (n === 'nat') {
          ['07', '70', '18', '81', '24', '42', '35', '53', '69', '96'].forEach(
            (num) => entries.push({ number: num, amount }),
          );
        } else if (/^\dh$/.test(n)) {
          for (let i = 0; i <= 9; i++)
            entries.push({ number: n[0] + i, amount });
        } else if (/^\dn$/.test(n)) {
          for (let i = 0; i <= 9; i++)
            entries.push({ number: i + n[0], amount });
        } else if (n.endsWith('r')) {
          const raw = n.replace('r', '');
          const rev = raw.split('').reverse().join('');
          entries.push({ number: raw, amount });
          if (raw !== rev) entries.push({ number: rev, amount });
        } else if (/^\d{2}$/.test(n)) {
          entries.push({ number: n, amount });
        }
      }
    }

    const merged = new Map<string, number>();
    entries.forEach((e) =>
      merged.set(e.number, (merged.get(e.number) || 0) + e.amount),
    );
    return Array.from(merged, ([number, amount]) => ({ number, amount }));
  }

  private async showConfirmation(ctx: BotContext) {
    const state = ctx.scene.state as any;
    const summary = state.betEntries
      .map((e) => `• ${e.number} - ${e.amount.toLocaleString()}`)
      .join('\n');
    await ctx.reply(
      `📝 <b>အတည်ပြုရန်</b>\n\n${summary}\n\n💰 စုစုပေါင်း: <b>${state.totalAmount.toLocaleString()} MMK</b>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ အတည်ပြုမည်', 'confirm_bet')],
          [Markup.button.callback('❌ ဖျက်မည်', 'cancel_bet')],
        ]),
      },
    );
  }

  @Action('confirm_bet')
  async handleConfirm(@Ctx() ctx: BotContext) {
    const { isOpen, session } = this.getSessionInfo();
    // if (!isOpen)
    //   return ctx.answerCbQuery('⚠️ ပိတ်သွားပါပြီ', { show_alert: true });

    const state = ctx.scene.state as any;
    const tid = BigInt(ctx.from!.id);

    try {
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { telegramId: tid } });
        if (!user) throw new Error('USER_NOT_FOUND');

        let netAmount = state.totalAmount;
        let commPercentage = 0;

        if (user.isReseller) {
          commPercentage = Number(user.commission || 15);
          netAmount = state.totalAmount * (1 - commPercentage / 100);
        }

        if (Number(user.balance) < netAmount) throw new Error('LOW_BALANCE');

        for (const bet of state.betEntries) {
          const stats = await tx.bet.aggregate({
            where: {
              number: bet.number,
              session,
              type: '2D',
              createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
            _sum: { amount: true },
          });
          if (
            Number(stats._sum.amount || 0) + bet.amount >
            this.GLOBAL_LIMIT_PER_NUMBER
          )
            throw new Error(`LIMIT:${bet.number}`);
        }

        await tx.user.update({
          where: { id: user.id },
          data: { balance: { decrement: netAmount } },
        });
        await tx.bet.createMany({
          data: state.betEntries.map((e) => ({
            userId: user.id,
            type: '2D',
            number: e.number,
            amount: e.amount,
            session,
          })),
        });
        await tx.transaction.create({
          data: {
            userId: user.id,
            amount: netAmount,
            type: 'PURCHASE',
            description: user.isReseller
              ? `2D Reseller (${commPercentage}%)`
              : `2D Regular`,
          },
        });

        await ctx.editMessageText(
          `✅ <b>အောင်မြင်ပါသည်။</b>\n\n📅 Date: ${new Date().toLocaleDateString()}\n🕒 Session: ${session}\n💰 Total: ${state.totalAmount.toLocaleString()} MMK` +
            (user.isReseller
              ? `\n📉 Net Paid: ${netAmount.toLocaleString()}`
              : ''),
          { parse_mode: 'HTML' },
        );
      });
    } catch (e: any) {
      const msg = e.message.startsWith('LIMIT:')
        ? `❌ ဂဏန်း ${e.message.split(':')[1]} Limit ပြည့်ပါပြီ`
        : e.message === 'LOW_BALANCE'
          ? '❌ လက်ကျန်ငွေ မလုံလောက်ပါ'
          : '❌ အမှားအယွင်းရှိပါသည်';
      await ctx.reply(msg);
    }
    return ctx.scene.leave();
  }

  @Action('cancel_bet')
  async onCancel(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await ctx.editMessageText('❌ ပယ်ဖျက်လိုက်ပါသည်။');
    return ctx.scene.leave();
  }
}
