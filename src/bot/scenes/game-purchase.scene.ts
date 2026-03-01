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
  quantity?: number;
  waitingForQuantity?: boolean;
  waitingForPhoto?: boolean;
}

@Scene('game_purchase_scene')
export class GamePurchaseScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    // --- မြန်မာစံတော်ချိန်ဖြင့် အချိန်စစ်ဆေးခြင်း ---
    const mmTime = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Yangon' }),
    );
    const currentHour = mmTime.getHours();

    // မနက် 10:00 မှ ည 12:00 အတွင်းသာ ခွင့်ပြုမည်
    if (currentHour < 10 || currentHour >= 24) {
      await ctx.reply(
        '🙏 <b>လူကြီးမင်းခင်ဗျာ...</b>\n\n' +
          'ကျွန်တော်တို့၏ ဝန်ဆောင်မှုကို <b>မနက် (10:00 AM) မှ ည (12:00 AM)</b> အတွင်းသာ ' +
          'အကောင်းဆုံး ဝန်ဆောင်မှု ပေးလျက်ရှိပါသည်ခင်ဗျာ။\n\n' +
          'ယခုအချိန်တွင် ခေတ္တပိတ်ထားပါသဖြင့် သတ်မှတ်ချိန်အတွင်း ပြန်လာခဲ့ပါရန် မေတ္တာရပ်ခံအပ်ပါသည်။ 🙏',
        {
          parse_mode: 'HTML',
          ...MAIN_KEYBOARD,
        },
      );
      return ctx.scene.leave();
    }

    const state = ctx.scene.state as GamePurchaseState;

    if (!state.productId) {
      await ctx.reply(
        '⚠️ စနစ်ချို့ယွင်းမှုကြောင့် Product အချက်အလက် မပြည့်စုံပါ။',
      );
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
        `ကျေးဇူးပြု၍ လူကြီးမင်း၏ <b>Player ID (Game User ID)</b> ကို ရိုက်ထည့်ပေးပါခင်ဗျာ။`,
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

    if (text === '🚫 မဝယ်တော့ပါ (Cancel)' || text === '/start') {
      await ctx.reply('❌ ဝယ်ယူမှုကို ပယ်ဖျက်လိုက်ပါပြီ။');
      return ctx.scene.leave();
    }

    // ၁။ Photo လက်ခံခြင်း (Step 4)
    if (state.waitingForPhoto) {
      if (!msg.photo)
        return ctx.reply('⚠️ ကျေးဇူးပြု၍ ငွေလွှဲပြေစာ ပုံပို့ပေးပါ။');
      return this.handlePhotoUpload(ctx, msg.photo);
    }

    // ၂။ အရေအတွက် လက်ခံခြင်း (Step 3)
    if (state.waitingForQuantity) {
      const qty = parseInt(text);
      if (isNaN(qty) || qty <= 0) {
        return ctx.reply(
          '⚠️ ကျေးဇူးပြု၍ အရေအတွက်ကို ဂဏန်းဖြင့် မှန်ကန်စွာ ရိုက်ထည့်ပေးပါ။',
        );
      }
      state.quantity = qty;
      state.waitingForQuantity = false;
      return this.askForPayment(ctx);
    }

    // ၃။ Player ID လက်ခံခြင်း (Step 1)
    if (!state.playerId) {
      state.playerId = text;
      const isMLBB =
        state.product.name.toUpperCase().includes('MLBB') ||
        state.product.category?.toUpperCase().includes('MLBB');

      if (isMLBB) {
        await ctx.reply(
          '✅ Player ID ရပါပြီ။\n\nကျေးဇူးပြု၍ <b>Server ID</b> ကို ဆက်လက်ရိုက်ထည့်ပေးပါ -',
        );
        return;
      } else {
        state.serverId = 'N/A';
        return this.askForQuantity(ctx); // MLBB မဟုတ်လျှင် အရေအတွက် တန်းမေးမယ်
      }
    }

    // ၄။ Server ID လက်ခံခြင်း (Step 2 - MLBB Only)
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
                  '✅ မှန်ကန်သည်၊ ဆက်သွားမည်',
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
    return this.askForQuantity(ctx); // Verification ပြီးရင် အရေအတွက် အရင်မေးမယ်
  }

  async askForQuantity(ctx: BotContext) {
    const state = ctx.scene.state as GamePurchaseState;
    state.waitingForQuantity = true;
    await ctx.reply(
      `🔢 ဝယ်ယူမည့် <b>အရေအတွက် (Quantity)</b> ကို ရိုက်ထည့်ပေးပါခင်ဗျာ -`,
      {
        parse_mode: 'HTML',
        ...Markup.keyboard([
          ['1', '2', '3'],
          ['5', '10', '🚫 မဝယ်တော့ပါ (Cancel)'],
        ]).resize(),
      },
    );
  }

  async askForPayment(ctx: BotContext) {
    const state = ctx.scene.state as GamePurchaseState;
    state.waitingForPhoto = true;

    const unitPrice = Number(state.product.price);
    const qty = state.quantity || 1;
    const totalPrice = unitPrice * qty;

    const paymentInfo =
      `🏦 <b>ငွေပေးချေရန် အချက်အလက်များ</b>\n` +
      `----------------------------------\n` +
      `📦 ပစ္စည်း: <b>${state.product.name}</b>\n` +
      `🔢 အရေအတွက်: <b>${qty}</b>\n` +
      `💰 စုစုပေါင်းကျသင့်ငွေ: <b>${totalPrice.toLocaleString()} MMK</b>\n` +
      `----------------------------------\n\n` +
      `💎 <b>KBZ Pay / Wave</b> : <code>09447032756</code>\n` +
      `👤 Name: <b>Zin Linn Aung</b>\n\n` +
      `အထက်ပါအကောင့်သို့ ငွေလွှဲပြီးပါက <b>ငွေလွှဲပြေစာ (Screenshot)</b> ကို ပေးပို့ပေးပါခင်ဗျာ။`;

    await ctx.reply(paymentInfo, {
      parse_mode: 'HTML', // MarkdownV2 အစား HTML သုံးခြင်းဖြင့် Error ကို ဖြေရှင်းသည်
      ...Markup.keyboard([['🚫 မဝယ်တော့ပါ (Cancel)']]).resize(),
    });
  }

  async handlePhotoUpload(ctx: BotContext, photoArray: any[]) {
    const state = ctx.scene.state as GamePurchaseState;
    const qty = state.quantity || 1;
    const totalPrice = Number(state.product.price) * qty;
    const loading = await ctx.reply('⏳ အော်ဒါတင်နေပါသည်...');

    try {
      const photo = photoArray[photoArray.length - 1];
      const fileId = photo.file_id;

      const user = await this.prisma.user.findUnique({
        where: { telegramId: BigInt(ctx.from.id) },
      });

      const purchase = await this.prisma.purchase.create({
        data: {
          userId: user.id,
          productId: state.product.id,
          quantity: qty,
          amount: totalPrice,
          playerId: state.playerId,
          serverId: state.serverId,
          nickname: state.nickname || 'N/A',
          status: 'PENDING',
        },
      });

      const adminMsg =
        `🛒 <b>Order အသစ် (Direct Pay)</b>\n\n` +
        `📦 ပစ္စည်း: <b>${state.product.name}</b>\n` +
        `🔢 အရေအတွက်: <b>${qty}</b>\n` +
        `💰 စုစုပေါင်း: <b>${totalPrice.toLocaleString()} MMK</b>\n` +
        `🎮 Nick: <b>${state.nickname || 'N/A'}</b>\n` +
        `🆔 ID: <code>${state.playerId}</code>\n` +
        `🌏 Server: <code>${state.serverId}</code>\n` +
        `👤 User: <a href="tg://user?id=${user.telegramId}">${user.firstName}</a>`;

      await ctx.telegram.sendPhoto(process.env.ADMIN_CHANNEL_ID, fileId, {
        caption: adminMsg,
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              '✅ Done (Direct)',
              `direct_done_${purchase.id}`,
            ),
            Markup.button.callback(
              '❌ Reject (Direct)',
              `direct_reject_${purchase.id}`,
            ),
          ],
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
    await ctx.reply('🔄 ကျေးဇူးပြု၍ <b>Player ID</b> ပြန်ရိုက်ပေးပါ -');
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
