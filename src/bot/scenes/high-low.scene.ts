import { Scene, SceneEnter, On, Ctx, Action } from 'nestjs-telegraf';
import { BotContext } from 'src/interfaces/bot-context.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { Markup } from 'telegraf';
import { MAIN_KEYBOARD } from '../bot.update';

@Scene('high_low_scene')
export class HighLowScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    const settings = await this.getSettings();
    const multiplier = parseFloat(settings['payoutMultiplier'] || '1.8');

    await ctx.reply(
      '🎲 <b>High/Low Game (အနိမ့်/အမြင့်)</b>\n\n' +
        '📜 <b>စည်းကမ်းများ:</b>\n' +
        '• <b>00 - 49</b> = LOW (အနိမ့်)\n' +
        '• <b>50 - 99</b> = HIGH (အမြင့်)\n' +
        `• အဆ: <b>${multiplier}x</b>\n\n` +
        '💰 လောင်းကြေးပမာဏ ရိုက်ထည့်ပါ (ဥပမာ: 1000) -',
      {
        parse_mode: 'HTML',
        ...Markup.keyboard([['🏠 ပင်မစာမျက်နှာ']]).resize(),
      },
    );
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext) {
    const text = (ctx.message as any)?.text?.trim();
    if (text === '🏠 ပင်မစာမျက်နှာ') {
      await ctx.scene.leave();
      await ctx.reply('🏠 ပင်မစာမျက်နှာသို့ ပြန်ရောက်ပါပြီ။', {
        parse_mode: 'HTML',
        ...MAIN_KEYBOARD,
      });
      return;
    }
    const amount = parseInt(text);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply('❌ ဂဏန်းအမှန်သာ ရိုက်ထည့်ပါ။');
      return;
    }
    return this.processBetInput(ctx, amount);
  }

  private async processBetInput(ctx: BotContext, amount: number) {
    const settings = await this.getSettings();
    const minBet = parseInt(settings['minBet'] || '500');
    const maxBet = parseInt(settings['maxBet'] || '100000');

    const user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(ctx.from.id) },
    });

    if (amount < minBet) {
      await ctx.reply(
        `❌ အနည်းဆုံး ${minBet.toLocaleString()} MMK လောင်းရပါမည်။`,
      );
      return;
    }

    if (amount > maxBet) {
      await ctx.reply(
        `❌ အများဆုံး ${maxBet.toLocaleString()} MMK သာ ခွင့်ပြုပါသည်။`,
      );
      return;
    }

    if (!user || Number(user.balance) < amount) {
      await ctx.reply('❌ လက်ကျန်ငွေ မလုံလောက်ပါ။');
      return;
    }

    (ctx.scene.state as any).betAmount = amount;
    await ctx.reply(
      `💵 လောင်းကြေး: <b>${amount.toLocaleString()} MMK</b>\n\nရွေးချယ်ပါ -`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('🔽 LOW (00-49)', 'choose_LOW'),
            Markup.button.callback('🔼 HIGH (50-99)', 'choose_HIGH'),
          ],
          [Markup.button.callback('❌ မကစားတော့ပါ', 'cancel_game')],
        ]),
      },
    );
    return;
  }

  @Action(/^choose_(LOW|HIGH)$/)
  async handlePlay(@Ctx() ctx: BotContext) {
    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch (e) {}

    const userChoice = (ctx as any).match[1];
    const amount = (ctx.scene.state as any).betAmount;
    const telegramId = BigInt(ctx.from.id);

    if (!amount) return ctx.reply('⚠️ Session သက်တမ်းကုန်သွားပါပြီ။');

    const settings = await this.getSettings();
    const baseWinRatio = parseInt(settings['winRatio'] || '40');
    const multiplier = parseFloat(settings['payoutMultiplier'] || '1.8');
    const PROFIT_LIMIT = 15000; // 💡 အသားတင်အမြတ် ကန့်သတ်ချက် (တစ်နေ့တာအတွက်)

    const user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: { highLowBets: { orderBy: { createdAt: 'desc' }, take: 10 } },
    });

    // ၁။ ယနေ့အတွက် အသားတင်အမြတ် (Net Profit) ကို တွက်ချက်ခြင်း
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayBets = await this.prisma.highLowBet.findMany({
      where: { userId: user.id, createdAt: { gte: today } },
    });

    let netProfit = 0;
    todayBets.forEach((bet) => {
      if (bet.status === 'WIN') {
        // အသားတင်မြတ်ငွေ = (ရရှိသော Payout - လောင်းကြေး Stake)
        netProfit += Number(bet.payout) - Number(bet.amount);
      } else {
        // ရှုံးသွားလျှင် Net Profit ထဲမှ ပြန်နှုတ်ပါမည်
        netProfit -= Number(bet.amount);
      }
    });

    // ၂။ Smart Logic စစ်ဆေးခြင်း
    const lastFiveLoss =
      user.highLowBets.length >= 5 &&
      user.highLowBets.slice(0, 5).every((bet) => bet.status === 'LOSE');

    // ၃။ Final Decision Logic (ဦးစားပေးအစီအစဉ်)
    let isWin: boolean;

    if (baseWinRatio >= 100) {
      isWin = true; // Admin 100% ပေးထားရင် အမြဲနိုင်မည်
    } else if (netProfit >= PROFIT_LIMIT) {
      isWin = false; // အသားတင်အမြတ် ၁၅,၀၀၀ ကျော်နေရင် ရှုံးစေမည်
    } else if (lastFiveLoss) {
      isWin = true; // ၅ ပွဲဆက်တိုက်ရှုံးရင် တစ်ပွဲပြန်နိုင်စေမည် (စွဲအောင်ဆွဲခြင်း)
    } else {
      const randomChance = Math.floor(Math.random() * 100);
      isWin = randomChance < baseWinRatio;
    }

    // ၄။ ရလဒ်ဂဏန်းထုတ်ပေးခြင်း
    let resultNum: number;
    if (isWin) {
      resultNum =
        userChoice === 'HIGH'
          ? Math.floor(Math.random() * 50) + 50
          : Math.floor(Math.random() * 50);
    } else {
      resultNum =
        userChoice === 'HIGH'
          ? Math.floor(Math.random() * 50)
          : Math.floor(Math.random() * 50) + 50;
    }

    const resultType = resultNum >= 50 ? 'HIGH' : 'LOW';
    const payout = isWin ? amount * multiplier : 0;

    try {
      const updatedUser = await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { balance: { decrement: amount } },
        });
        await tx.highLowBet.create({
          data: {
            userId: user.id,
            amount,
            choice: userChoice,
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

      await ctx.reply('🎲 ဂဏန်းလှည့်နေသည်...');

      setTimeout(async () => {
        const resultMsg = isWin
          ? `🎉 <b>ဂုဏ်ယူပါတယ်!</b>\nနိုင်ငွေ: <b>+${payout.toLocaleString()} MMK</b>`
          : `😢 <b>စိတ်မကောင်းပါဘူး...</b>\nရှုံးငွေ: <b>-${amount.toLocaleString()} MMK</b>`;

        await ctx.reply(
          `🎰 <b>ပွဲရလဒ်: ${resultNum} (${resultType})</b>\n━━━━━━━━━━━━━━━━━\n` +
            `ရွေးချယ်မှု : <b>${userChoice}</b>\n━━━━━━━━━━━━━━━━━\n\n` +
            `${resultMsg}\n\n💰 လက်ကျန်ငွေ: <b>${Number(updatedUser.balance).toLocaleString()} MMK</b>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '🔄 ထပ်ကစားမည် (တူညီသောပမာဏ)',
                  `replay_${amount}`,
                ),
              ],
              [Markup.button.callback('🏠 ပင်မစာမျက်နှာ', 'go_main')],
            ]),
          },
        );
      }, 1200);
    } catch (error) {
      await ctx.reply('❌ စနစ်ချို့ယွင်းချက်ရှိပါသည်။');
    }
  }

  @Action(/replay_(\d+)/)
  async onReplay(@Ctx() ctx: BotContext) {
    const amount = parseInt((ctx as any).match[1]);
    await ctx.answerCbQuery();
    return this.processBetInput(ctx, amount);
  }

  @Action('go_main')
  async onGoMain(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await ctx.scene.leave();
    return ctx.reply('🏠 ပင်မစာမျက်နှာသို့ ပြန်ရောက်ပါပြီ။', MAIN_KEYBOARD);
  }

  @Action('cancel_game')
  async onCancel(@Ctx() ctx: BotContext) {
    await ctx.deleteMessage();
    await ctx.answerCbQuery('Cancelled');
    await ctx.reply('လောင်းကြေးပမာဏကို ပြန်လည်ရိုက်ထည့်နိုင်ပါသည်။');
  }

  private async getSettings() {
    const settings = await this.prisma.systemSetting.findMany();
    return settings.reduce(
      (acc, curr) => ({ ...acc, [curr.key]: curr.value }),
      {},
    );
  }
}
