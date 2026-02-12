import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getBotToken } from 'nestjs-telegraf';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // 1. Get Services and Token
  const configService = app.get(ConfigService);
  const botToken = configService.get<string>('BOT_TOKEN');
  const port = configService.get<number>('PORT') || 3000;

  // ⭐ 2. ENABLE CORS (Admin Dashboard အတွက် အရေးကြီးဆုံး)
  // React Frontend (localhost:5173) ကနေ API လှမ်းခေါ်တာကို ခွင့်ပြုရန်
  app.enableCors({
    origin: '*', // Production ရောက်ရင် 'http://your-admin-domain.com' လို့ ပြောင်းပါ
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // 3. WEBHOOK MIDDLEWARE
  const bot = app.get(getBotToken());
  app.use(bot.webhookCallback(`/bot${botToken}`));

  // 4. Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // 5. Start the Application
  await app.listen(port, '0.0.0.0');

  logger.log(`🚀 Application is running on: http://localhost:${port}`);

  // Webhook URL Debugging
  const webhookUrl = configService.get<string>('WEBHOOK_URL');
  if (webhookUrl) {
    logger.log(`🤖 Bot Webhook: ${webhookUrl}/bot${botToken}`);
  } else {
    logger.warn(`⚠️ WEBHOOK_URL is not defined in .env!`);
  }
}

bootstrap();
