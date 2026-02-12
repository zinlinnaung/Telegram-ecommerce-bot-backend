import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';
import axios from 'axios';

@Injectable()
export class LotteryService {
  private readonly logger = new Logger(LotteryService.name);
  private readonly CHANNEL_ID = '-1003869458358'; // သင့် Channel ID

  constructor(@InjectBot() private bot: Telegraf<any>) {}

  // --- ၁။ မနက်ပိုင်း ရလဒ် (12:01 PM) ---
  @Cron('0 1 12 * * 1-5')
  async handleMorningResult() {
    this.logger.log('Sending morning 2D result...');
    await this.fetchAndSend('MORNING (မနက်ပိုင်း)');
  }

  // --- ၂။ ညနေပိုင်း ရလဒ် (04:31 PM) ---
  @Cron('0 31 16 * * 1-5')
  async handleEveningResult() {
    this.logger.log('Sending evening 2D result...');
    await this.fetchAndSend('EVENING (ညနေပိုင်း)');
  }

  // --- Core Logic ---
  async fetchAndSend(sessionName: string) {
    try {
      const response = await axios.get('https://api.thaistock2d.com/live');
      const data = response.data.live;

      // --- Local Time ပြောင်းလဲခြင်း ---
      // လက်ရှိအချိန်ကို ယူပြီး မြန်မာစံတော်ချိန် AM/PM format ပြောင်းပါမယ်
      const now = new Date();
      const myanmarTime = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Yangon',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true, // AM/PM ဖြစ်စေရန်
      }).format(now);

      const twod = data.twod;
      const set = data.set;
      const value = data.value;

      const message =
        `🔔 <b>၂ဒီ ထွက်ဂဏန်း အတည်ပြုချက်</b>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📅 <b>အပိုင်း:</b> ${sessionName}\n` +
        `🕒 <b>မြန်မာစံတော်ချိန်:</b> ${myanmarTime}\n` + // ပြောင်းလဲထားသော အချိန်
        `━━━━━━━━━━━━━━━━━━\n` +
        `📈 SET:  <b>${set}</b>\n` +
        `💰 VALUE: <b>${value}</b>\n\n` +
        `🎯 ထွက်ဂဏန်း: <pre>${twod}</pre>\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🤖 <b>ကိုယ်တိုင်ထိုးရန်:</b> @trustvpn_digital_bot\n` +
        `✅ အလျော်အစား စိတ်ချရသော Official Channel`;

      await this.bot.telegram.sendMessage(this.CHANNEL_ID, message, {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '🛒 အခုပဲ ထိုးမယ်',
                url: 'https://t.me/trustvpn_digital_bot',
              },
            ],
          ],
        },
      });

      this.logger.log(`${sessionName} result sent at ${myanmarTime}`);
    } catch (error: any) {
      this.logger.error('API Error:', error.message);
    }
  }
}
