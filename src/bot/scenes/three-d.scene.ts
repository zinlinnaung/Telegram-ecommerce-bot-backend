import { Scene, SceneEnter, Ctx } from 'nestjs-telegraf';
import { BotContext } from 'src/interfaces/bot-context.interface';

@Scene('scene_3d')
export class ThreeDScene {
  @SceneEnter()
  async onEnter(@Ctx() ctx: BotContext) {
    // 1. အကြောင်းကြားစာ ပို့မည်
    await ctx.reply(
      '⚠️ <b>ဆောရီးပါခင်ဗျာ</b>\n\n3D ထိုးခြင်းဝန်ဆောင်မှုကို လက်ရှိတွင် အသုံးပြု၍ မရသေးပါသဖြင့် နောက်မှ ပြန်လည် ကြိုးစားပေးပါရန်။',
      { parse_mode: 'HTML' },
    );

    // 2. Scene ထဲကနေ ချက်ချင်း ပြန်ထွက်ခိုင်းမည်
    await ctx.scene.leave();
  }

  // အောက်က @On('text') logic တွေက အလိုအလျောက် အလုပ်လုပ်တော့မှာ မဟုတ်ပါ (Scene ထဲက ထွက်သွားပြီဖြစ်သောကြောင့်)
}
