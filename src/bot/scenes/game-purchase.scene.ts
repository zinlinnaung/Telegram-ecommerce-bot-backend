import { Scene, SceneEnter, On, Ctx, Action } from 'nestjs-telegraf';
import { BotContext } from 'src/interfaces/bot-context.interface';
import { PrismaService } from 'src/prisma/prisma.service';
import { Markup } from 'telegraf';
import axios from 'axios'; // axios ကို install လုပ်ထားရပါမယ် (npm install axios)

@Scene('game_purchase_scene')
export class GamePurchaseScene {
  constructor(private readonly prisma: PrismaService) {}

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    // @ts-ignore
    const productId = ctx.scene.state.productId;
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product) {
      await ctx.reply('Product not found.');
      return ctx.scene.leave();
    }

    // @ts-ignore
    ctx.scene.state.product = product;

    await ctx.reply(
      `🎮 <b>${product.name}</b>\n\nကျေးဇူးပြု၍ <b>Player ID (Game ID)</b> ကို ရိုက်ထည့်ပေးပါခင်ဗျာ။`,
      { parse_mode: 'HTML', ...Markup.removeKeyboard() },
    );
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext) {
    const text = (ctx.message as any).text;
    // @ts-ignore
    const state = ctx.scene.state as {
      product?: any;
      playerId?: string;
      serverId?: string;
      nickname?: string;
    };

    // Step 1: Get Player ID
    if (!state.playerId) {
      state.playerId = text;

      // MLBB ဟုတ်မဟုတ် စစ်မယ်
      if (
        state.product.name.toUpperCase().includes('MLBB') ||
        state.product.category.toUpperCase().includes('MLBB')
      ) {
        await ctx.reply(
          '✅ Player ID ရပါပြီ။\n\nကျေးဇူးပြု၍ <b>Server ID</b> ကို ရိုက်ထည့်ပေးပါခင်ဗျာ။',
        );
      } else {
        // PUBG/Others - လက်ရှိ API က MLBB ပဲဆိုရင် ဒါကို တန်းကျော်မယ်
        state.serverId = 'N/A';
        return this.confirmOrder(ctx);
      }
      return;
    }

    // Step 2: Get Server ID & Validate Nickname (MLBB Only)
    if (!state.serverId) {
      state.serverId = text;

      try {
        await ctx.reply('⏳ အကောင့်အမည် စစ်ဆေးနေပါသည်...');

        // API ခေါ်ယူခြင်း
        const response = await axios.get(
          `https://cekidml.caliph.dev/api/validasi?id=${state.playerId}&serverid=${state.serverId}`,
        );

        if (response.data.status === 'success') {
          const nickname = response.data.result.nickname;
          // Nickname ကို state ထဲ သိမ်းထားမယ်
          state.nickname = nickname;

          // User ကို အတည်ပြုခိုင်းမယ်
          await ctx.reply(
            `👤 <b>အကောင့်အမည်တွေ့ရှိချက်:</b>\n\n` +
              `Nickname: <b>${nickname}</b>\n` +
              `ID: ${state.playerId} (${state.serverId})\n\n` +
              `အကောင့်အမည် မှန်ကန်ပါသလား?`,
            {
              parse_mode: 'HTML',
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    '✅ မှန်ကန်ပါသည်၊ ဝယ်ယူမည်',
                    'confirm_game_buy',
                  ),
                ],
                [
                  Markup.button.callback(
                    '❌ မှားနေပါသည်၊ ပြန်ရိုက်မည်',
                    'restart_input',
                  ),
                ],
              ]),
            },
          );
        } else {
          // ID မှားနေလျှင်
          await ctx.reply(
            '❌ အကောင့်ရှာမတွေ့ပါ။ ID နှင့် Server ပြန်လည်စစ်ဆေးပေးပါ။',
          );
          state.playerId = null; // ပြန်ရိုက်ခိုင်းဖို့ reset လုပ်မယ်
          state.serverId = null;
          await ctx.reply(
            'ကျေးဇူးပြု၍ <b>Player ID</b> ကို ပြန်လည်ရိုက်ထည့်ပါ -',
          );
        }
      } catch (error) {
        console.error('API Error:', error);
        await ctx.reply(
          '⚠️ စနစ်ချို့ယွင်းမှုကြောင့် အကောင့်အမည် စစ်လို့မရပါ။ ပုံမှန်အတိုင်း ဆက်သွားပါမည်။',
        );
        return this.confirmOrder(ctx);
      }
    }
  }

  // Inline Button Action များ
  @Action('confirm_game_buy')
  async onConfirm(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await ctx.deleteMessage();
    return this.confirmOrder(ctx);
  }

  @Action('restart_input')
  async onRestart(@Ctx() ctx: BotContext) {
    // @ts-ignore
    ctx.scene.state.playerId = null;
    // @ts-ignore
    ctx.scene.state.serverId = null;
    await ctx.answerCbQuery();
    await ctx.reply('ကျေးဇူးပြု၍ <b>Player ID</b> ကို ပြန်ရိုက်ပေးပါ -');
  }

  async confirmOrder(ctx: BotContext) {
    // @ts-ignore
    const { product, playerId, serverId, nickname } = ctx.scene.state;
    const userId = Number(ctx.from.id);

    const user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(userId) },
    });
    if (Number(user.balance) < Number(product.price)) {
      await ctx.reply('⚠️ လက်ကျန်ငွေ မလုံလောက်ပါ။');
      return ctx.scene.leave();
    }

    const purchase = await this.prisma.purchase.create({
      data: {
        userId: user.id,
        productId: product.id,
        amount: product.price,
        playerId: playerId,
        serverId: serverId,
        status: 'PENDING',
      },
      include: { user: true, product: true },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { balance: { decrement: product.price } },
    });

    await ctx.reply(`✅ အော်ဒါတင်ပြီးပါပြီ။ Admin မှ ဖြည့်သွင်းပေးပါလိမ့်မည်။`);

    // Admin ဆီ ပို့တဲ့ စာသားမှာ Nickname ပါ ထည့်ပေးလိုက်မယ်
    const adminMsg =
      `🛒 <b>New Game Top-up!</b>\n\n` +
      `📦 Item: ${product.name}\n` +
      `🎮 <b>Nickname: ${nickname || 'N/A'}</b>\n` + // <--- API ကရတဲ့ Nickname
      `🆔 ID: <code>${playerId}</code>\n` +
      `🌏 Server: <code>${serverId}</code>\n` +
      `👤 User: <a href="tg://user?id=${user.telegramId}">${user.firstName}</a>`;

    await ctx.telegram.sendMessage(process.env.ADMIN_CHANNEL_ID, adminMsg, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Done', `order_done_${purchase.id}`)],
        [Markup.button.callback('❌ Reject', `order_reject_${purchase.id}`)],
      ]),
    });

    return ctx.scene.leave();
  }
}
