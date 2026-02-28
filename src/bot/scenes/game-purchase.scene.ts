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
import { MAIN_KEYBOARD } from '../bot.update';

interface GamePurchaseState {
  productId: number;
  product?: any;
  playerId?: string;
  serverId?: string;
  nickname?: string;
  waitingForPhoto?: boolean; // New flag to track step
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

  @On('message')
  async onMessage(@Ctx() ctx: BotContext) {
    const msg = ctx.message as any;
    const text = msg.text;
    const state = ctx.scene.state as GamePurchaseState;

    // Handle Cancel
    if (text === '🚫 မဝယ်တော့ပါ (Cancel)' || text === '/start') {
      await ctx.reply('❌ ဝယ်ယူမှုကို ပယ်ဖျက်လိုက်ပါပြီ။');
      return ctx.scene.leave();
    }

    // Step: Handle Photo Upload
    if (state.waitingForPhoto) {
      if (!msg.photo) {
        return ctx.reply(
          '⚠️ ကျေးဇူးပြု၍ ငွေလွှဲပြေစာ (Screenshot) ကို ပုံအဖြစ် ပို့ပေးပါရန်။',
        );
      }
      return this.handlePhotoUpload(ctx, msg.photo);
    }

    // Step: Get Player ID
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
        state.serverId = 'N/A';
        return this.askForPayment(ctx);
      }
    }

    // Step: Get Server ID (MLBB)
    if (!state.serverId) {
      state.serverId = text;
      return this.validateMLBB(ctx, state);
    }
  }

  async validateMLBB(ctx: BotContext, state: GamePurchaseState) {
    const loading = await ctx.reply('⏳ အကောင့်အမည် စစ်ဆေးနေပါသည်...');
    try {
      const res = await axios.get(
        `https://cekidml.caliph.dev/api/validasi?id=${state.playerId}&serverid=${state.serverId}`,
        { timeout: 8000 },
      );

      await ctx.telegram
        .deleteMessage(ctx.chat.id, loading.message_id)
        .catch(() => {});

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
      } else {
        state.playerId = undefined;
        state.serverId = undefined;
        await ctx.reply(
          '❌ ID သို့မဟုတ် Server မှားယွင်းနေပါသည်။ ပြန်လည်ရိုက်ထည့်ပေးပါ -',
        );
      }
    } catch (e) {
      await ctx.telegram
        .deleteMessage(ctx.chat.id, loading.message_id)
        .catch(() => {});
      await ctx.reply('⚠️ အကောင့်စစ်ဆေး၍မရပါ။ အမည်မစစ်ဘဲ ဆက်သွားမည်လား?', {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🚀 ဆက်သွားမည်', 'confirm_game_buy')],
          [Markup.button.callback('❌ မဝယ်တော့ပါ', 'cancel_action')],
        ]),
      });
    }
  }

  @Action('confirm_game_buy')
  async onConfirm(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    return this.askForPayment(ctx);
  }

  async askForPayment(ctx: BotContext) {
    const state = ctx.scene.state as GamePurchaseState;
    state.waitingForPhoto = true;

    const paymentInfo =
      `🏦 <b>ငွေပေးချေရန် အချက်အလက်များ</b>\n` +
      `➖➖➖➖➖➖➖➖➖➖\n` +
      `💎 <b>KBZ Pay / Wave</b> : <code>09447032756</code>\n` +
      `👤 Name: <b>Zin Linn Aung</b>\n` +
      `💰 ကျသင့်ငွေ: <b>${state.product.price.toLocaleString()} MMK</b>\n` +
      `➖➖➖➖➖➖➖➖➖➖\n\n` +
      `အထက်ပါအကောင့်သို့ ငွေလွှဲပြီးပါက <b>ငွေလွှဲပြေစာ (Screenshot)</b> ကို ပေးပို့ပေးပါခင်ဗျာ။`;

    await ctx.reply(paymentInfo, {
      parse_mode: 'HTML',
      ...Markup.keyboard([['🚫 မဝယ်တော့ပါ (Cancel)']]).resize(),
    });
  }

  async handlePhotoUpload(ctx: BotContext, photoArray: any[]) {
    const state = ctx.scene.state as GamePurchaseState;
    const loading = await ctx.reply('⏳ အော်ဒါတင်နေပါသည်...');

    try {
      const photo = photoArray[photoArray.length - 1];
      const fileId = photo.file_id;
      const user = await this.prisma.user.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
      });

      // Create Purchase Record (Status: PENDING)
      const purchase = await this.prisma.purchase.create({
        data: {
          userId: user.id,
          productId: state.product.id,
          amount: state.product.price,
          playerId: state.playerId,
          serverId: state.serverId,
          nickname: state.nickname || 'N/A',
          status: 'PENDING',
          // If your schema has a field for screenshot, save fileId here
          // screenshot: fileId
        },
      });

      // Notify Admin with Photo and Buttons
      const adminMsg =
        `🛒 <b>Order အသစ် (Direct Pay)</b>\n\n` +
        `📦 ပစ္စည်း: ${state.product.name}\n` +
        `💰 ဈေးနှုန်း: ${state.product.price.toLocaleString()} MMK\n` +
        `🎮 Nick: <b>${state.nickname || 'N/A'}</b>\n` +
        `🆔 ID: <code>${state.playerId}</code>\n` +
        `🌏 Server: <code>${state.serverId}</code>\n` +
        `👤 User: <a href="tg://user?id=${user.telegramId}">${user.firstName}</a>`;

      await ctx.telegram.sendPhoto(process.env.ADMIN_CHANNEL_ID, fileId, {
        caption: adminMsg,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          Markup.button.callback(
            '✅ Done (Direct)',
            `direct_done_${purchase.id}`,
          ),
          Markup.button.callback(
            '❌ Reject (Direct)',
            `direct_reject_${purchase.id}`,
          ),
        ]),
      });

      await ctx.telegram
        .deleteMessage(ctx.chat.id, loading.message_id)
        .catch(() => {});
      await ctx.reply(
        '✅ အော်ဒါတင်ခြင်း အောင်မြင်ပါသည်။ Admin မှ စစ်ဆေးပြီးပါက ဖြည့်သွင်းပေးပါမည်။',
      );
      return ctx.scene.leave();
    } catch (e) {
      console.error(e);
      await ctx.reply(
        '❌ အမှားအယွင်းတစ်ခု ဖြစ်သွားပါသည်။ Admin ကို ဆက်သွယ်ပါ။',
      );
      return ctx.scene.leave();
    }
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

  @SceneLeave()
  async onLeave(@Ctx() ctx: BotContext) {
    await ctx.reply('🏠 ပင်မစာမျက်နှာသို့ ပြန်ရောက်ပါပြီ။', MAIN_KEYBOARD);
  }
}
