import {
  Scene,
  SceneEnter,
  SceneLeave,
  On,
  Ctx,
  Action,
} from 'nestjs-telegraf';
import { BotContext } from 'src/interfaces/bot-context.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { Markup } from 'telegraf';
import axios from 'axios';
// BotUpdate က MAIN_KEYBOARD ကို export လုပ်ထားဖို့ လိုပါတယ်
import { MAIN_KEYBOARD } from '../bot.update';

interface GamePurchaseState {
  productId: number;
  product?: any;
  playerId?: string;
  serverId?: string;
  nickname?: string;
}

@Scene('game_purchase_scene')
export class GamePurchaseScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    const state = ctx.scene.state as GamePurchaseState;

    if (!state.productId) {
      await ctx.reply('⚠️ Product အချက်အလက် မပြည့်စုံပါ။');
      return ctx.scene.leave();
    }

    const product = await this.prisma.product.findUnique({
      where: { id: state.productId },
    });

    if (!product) {
      await ctx.reply('❌ ဤပစ္စည်းမှာ လက်ရှိ ဝယ်ယူ၍မရနိုင်တော့ပါ။');
      return ctx.scene.leave();
    }

    state.product = product;

    await ctx.reply(
      `🎮 <b>${product.name}</b>\n` +
        `💰 ဈေးနှုန်း: <b>${product.price.toLocaleString()} MMK</b>\n\n` +
        `ကျေးဇူးပြု၍ <b>Player ID (Game ID)</b> ကို ရိုက်ထည့်ပေးပါ -`,
      {
        parse_mode: 'HTML',
        ...Markup.keyboard([['🚫 မဝယ်တော့ပါ (Cancel)']]).resize(),
      },
    );
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext) {
    const text = (ctx.message as any).text;
    const state = ctx.scene.state as GamePurchaseState;

    // "Cancel" ခလုတ် နှိပ်လိုက်လျှင်
    if (text === '🚫 မဝယ်တော့ပါ (Cancel)' || text === '/start') {
      await ctx.reply('❌ ဝယ်ယူမှုကို ပယ်ဖျက်လိုက်ပါပြီ။');
      return ctx.scene.leave();
    }

    // Step 1: Get Player ID
    if (!state.playerId) {
      state.playerId = text;

      const isMLBB =
        state.product.name.toUpperCase().includes('MLBB') ||
        state.product.category?.toUpperCase().includes('MLBB');

      if (isMLBB) {
        await ctx.reply(
          '✅ Player ID ရပါပြီ။\n\nကျေးဇူးပြု၍ <b>Server ID</b> ကို ဆက်လက်ရိုက်ထည့်ပေးပါ -',
          { parse_mode: 'HTML' },
        );
        return;
      } else {
        // MLBB မဟုတ်လျှင် Server ID မလို (N/A)
        state.serverId = 'N/A';
        return this.confirmOrder(ctx);
      }
    }

    // Step 2: Get Server ID (MLBB သမားများအတွက်)
    if (!state.serverId) {
      state.serverId = text;
      await this.validateMLBB(ctx, state);
    }
  }

  async validateMLBB(ctx: BotContext, state: GamePurchaseState) {
    const loading = await ctx.reply('⏳ အကောင့်အမည် စစ်ဆေးနေပါသည်...');

    try {
      const res = await axios.get(
        `https://cekidml.caliph.dev/api/validasi?id=${state.playerId}&serverid=${state.serverId}`,
        { timeout: 8000 },
      );

      // loading message ကို ဖျက်မယ်
      await ctx.telegram
        .deleteMessage(ctx.chat.id, loading.message_id)
        .catch(() => {});

      // API အောင်မြင်လျှင်
      if (res.data.status === 'success') {
        state.nickname = res.data.result?.nickname;

        await ctx.reply(
          `👤 <b>အကောင့်အမည်တွေ့ရှိချက်:</b>\n\n` +
            `အမည်: <b>${state.nickname}</b>\n` +
            `ID: ${state.playerId} (${state.serverId})\n\n` +
            `အချက်အလက် မှန်ကန်ပါသလား?`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '✅ မှန်ကန်သည်၊ ဝယ်မည်',
                  'confirm_game_buy',
                ),
              ],
              [
                Markup.button.callback(
                  '❌ မှားနေသည်၊ ပြန်ရိုက်မည်',
                  'restart_input',
                ),
              ],
            ]),
          },
        );
      }
      // API က failed ဖြစ်လျှင် (ID/Server မှားခြင်း)
      else {
        state.playerId = undefined; // Step 1 ကနေ ပြန်စနိုင်အောင် reset လုပ်မယ်
        state.serverId = undefined;

        await ctx.reply(
          `❌ <b>ရှာမတွေ့ပါ-</b> ${res.data.message || 'ID သို့မဟုတ် Server မှားယွင်းနေပါသည်။'}\n\n` +
            `ကျေးဇူးပြု၍ <b>Player ID</b> ကို ပြန်လည်ရိုက်ထည့်ပေးပါ -`,
          { parse_mode: 'HTML' },
        );
      }
    } catch (e) {
      await ctx.telegram
        .deleteMessage(ctx.chat.id, loading.message_id)
        .catch(() => {});

      // API Down နေလျှင် Manual ဆက်သွားခိုင်းမည်
      await ctx.reply(
        `⚠️❌ <b>ရှာမတွေ့ပါ-</b>  'ID သို့မဟုတ် Server မှားယွင်းနေပါသည်။'}\n\n`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                '🚀 အမည်မစစ်ဘဲ ဆက်သွားမည်',
                'confirm_game_buy',
              ),
            ],
            [Markup.button.callback('❌ မဝယ်တော့ပါ', 'cancel_action')],
          ]),
        },
      );
    }
  }

  @Action('confirm_game_buy')
  async onConfirm(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    return this.confirmOrder(ctx);
  }

  @Action('restart_input')
  async onRestart(@Ctx() ctx: BotContext) {
    const state = ctx.scene.state as GamePurchaseState;
    state.playerId = undefined;
    state.serverId = undefined;
    await ctx.answerCbQuery();
    await ctx.reply('🔄 ကျေးဇူးပြု၍ <b>Player ID</b> ပြန်ရိုက်ပေးပါ -', {
      parse_mode: 'HTML',
    });
  }

  @Action('cancel_action')
  async onCancel(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    return ctx.scene.leave();
  }

  async confirmOrder(ctx: BotContext) {
    const state = ctx.scene.state as GamePurchaseState;
    const userId = BigInt(ctx.from.id);

    try {
      // ⚠️ Prisma Transaction သုံးပြီး Database ကို Update လုပ်မယ်
      await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { telegramId: userId },
        });

        if (Number(user.balance) < Number(state.product.price)) {
          throw new Error('LOW_BALANCE');
        }

        // Purchase Record ထည့်မယ်
        const purchase = await tx.purchase.create({
          data: {
            userId: user.id,
            productId: state.product.id,
            amount: state.product.price,
            playerId: state.playerId,
            serverId: state.serverId,
            status: 'PENDING',
          },
          include: { user: true, product: true },
        });

        // User Balance နှုတ်မယ်
        await tx.user.update({
          where: { id: user.id },
          data: { balance: { decrement: state.product.price } },
        });

        // Admin Channel ဆီ ပို့မယ်
        const adminMsg =
          `🛒 <b>Order အသစ်ရောက်ပါပြီ!</b>\n\n` +
          `📦 ပစ္စည်း: ${state.product.name}\n` +
          `🎮 Nick: <b>${state.nickname || 'N/A'}</b>\n` +
          `🆔 ID: <code>${state.playerId}</code>\n` +
          `🌏 Server: <code>${state.serverId}</code>\n` +
          `👤 User: <a href="tg://user?id=${user.telegramId}">${user.firstName}</a>`;

        await ctx.telegram.sendMessage(process.env.ADMIN_CHANNEL_ID, adminMsg, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('✅ Done', `order_done_${purchase.id}`)],
            [
              Markup.button.callback(
                '❌ Reject',
                `order_reject_${purchase.id}`,
              ),
            ],
          ]),
        });
      });

      await ctx.reply(
        '✅ အော်ဒါတင်ခြင်း အောင်မြင်ပါသည်။ Admin မှ ဖြည့်သွင်းပေးရန် စောင့်ဆိုင်းနေပါသည်။',
      );
    } catch (e: any) {
      if (e.message === 'LOW_BALANCE') {
        await ctx.reply('⚠️ လူကြီးမင်း၏ လက်ကျန်ငွေ မလုံလောက်ပါခင်ဗျာ။');
      } else {
        console.error('Purchase Error:', e);
        await ctx.reply(
          '❌ စနစ်ချို့ယွင်းမှုတစ်ခု ဖြစ်ပွားခဲ့ပါသည်။ ခေတ္တစောင့်ပေးပါ။',
        );
      }
    }
    return ctx.scene.leave();
  }

  @SceneLeave()
  async onLeave(@Ctx() ctx: BotContext) {
    // Scene က ထွက်လိုက်တာနဲ့ Main Menu Keyboard ကို ပြန်ပြပေးပါမယ်
    await ctx.reply('🏠 ပင်မစာမျက်နှာသို့ ပြန်ရောက်ပါပြီ။', MAIN_KEYBOARD);
  }
}
