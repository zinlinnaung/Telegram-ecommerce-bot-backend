// import { Injectable, InternalServerErrorException } from '@nestjs/common';
// import { GoogleGenerativeAI } from '@google/generative-ai';
// import { Express } from 'express';

// @Injectable()
// export class SubtitleService {
//   private genAI: GoogleGenerativeAI;
//   private model: any;

//   constructor() {
//     // သင့်ရဲ့ Gemini API Key ကို .env file ထဲမှာ ထည့်ထားသင့်ပါတယ်
//     this.genAI = new GoogleGenerativeAI(
//       process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE',
//     );

//     // Subtitle ဘာသာပြန်ဖို့အတွက် ပေါ့ပါးပြီးမြန်တဲ့ Flash model ကိုသုံးပါတယ်
//     this.model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
//   }

//   async translateSrt(file: Express.Multer.File): Promise<string> {
//     try {
//       // 1. Buffer မှ String သို့ပြောင်းခြင်း
//       const srtContent = file.buffer.toString('utf-8');

//       // 2. Subtitle တွေကို Block အလိုက်ခွဲထုတ်ခြင်း (Double newlines နဲ့ ခွဲတာပါ)
//       // SRT format: Number \n Time \n Text \n\n
//       const blocks = srtContent.split(/\n\n/);

//       let translatedSrt = '';
//       const batchSize = 15; // တစ်ခါပို့ရင် block ၁၅ ခုလောက်ပဲ ပို့မယ် (Rate limit မထိအောင်)

//       // 3. Batch လိုက်ခွဲပြီး Loop ပတ်မောင်းခြင်း
//       for (let i = 0; i < blocks.length; i += batchSize) {
//         const chunk = blocks.slice(i, i + batchSize).join('\n\n');

//         if (!chunk.trim()) continue; // Empty chunk ဆို ကျော်မယ်

//         const prompt = `
//           You are a professional subtitle translator.
//           Translate the following English SRT subtitle blocks into natural-sounding Burmese (Myanmar).

//           RULES:
//           1. Keep the SRT format EXACTLY as is (Sequence number, Timestamps).
//           2. ONLY translate the dialogue text. Do NOT translate timestamps.
//           3. Do not add any explanation or markdown. Just return the raw SRT string.

//           Input SRT:
//           ${chunk}
//         `;

//         const result = await this.model.generateContent(prompt);
//         const response = await result.response;
//         const text = response.text();

//         // ရလာတဲ့ result ကို ပေါင်းထည့်မယ်
//         translatedSrt += text + '\n\n';

//         // Gemini Free Tier Rate Limit ရှောင်ရန် အနည်းငယ် delay ခံခြင်း (လိုအပ်ရင်)
//         // await new Promise(resolve => setTimeout(resolve, 1000));
//       }

//       return translatedSrt;
//     } catch (error) {
//       console.error('Translation Error:', error);
//       throw new InternalServerErrorException('Failed to translate subtitle');
//     }
//   }
// }
