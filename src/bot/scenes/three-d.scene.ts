import { Scene, SceneEnter, On, Ctx } from 'nestjs-telegraf';
import { BotContext } from 'src/interfaces/bot-context.interface';
import { UsersService } from 'src/users/users.service';

@Scene('scene_3d')
export class ThreeDScene {
  constructor(private readonly usersService: UsersService) {}

  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    await ctx.reply(
      '🎲 <b>3D ထိုးမည်</b>\n\nထိုးလိုသော ဂဏန်းကို ရိုက်ထည့်ပါ (ဥပမာ - 123)',
      { parse_mode: 'HTML' },
    );
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext) {
    const input = (ctx.message as any).text;

    if (input.toLowerCase() === 'exit') {
      await ctx.scene.leave();
      return ctx.reply('ပင်မစာမျက်နှာသို့ ပြန်ရောက်ပါပြီ။');
    }

    // ၃ လုံး ဟုတ်မဟုတ် စစ်မယ်
    if (!/^\d{3}$/.test(input)) {
      await ctx.reply('❌ 3D ဂဏန်း (၃) လုံး ဖြစ်ရပါမယ်ခင်ဗျာ။ (ဥပမာ - 567)');
      return;
    }

    await ctx.reply(`✅ <b>${input}</b> ကို လက်ခံရရှိပါသည်။`, {
      parse_mode: 'HTML',
    });
    await ctx.scene.leave();
  }
}
