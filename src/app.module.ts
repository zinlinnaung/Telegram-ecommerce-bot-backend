import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { session } from 'telegraf';
import { PrismaModule } from './prisma/prisma.module';
import { BotModule } from './bot/bot.module';
import { ScheduleModule } from '@nestjs/schedule';
import { LotteryModule } from './lottery/lottery.module';
import { AdminController } from './admin/admin.controller';
import { WithdrawService } from './wallet/withdraw.service';
import { WalletService } from './wallet/wallet.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    LotteryModule,
    TelegrafModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const token = configService.get<string>('BOT_TOKEN');
        const url = configService.get<string>('WEBHOOK_URL');

        return {
          token: token,
          middlewares: [session()],
          // --- WEBHOOK CONFIGURATION START ---
          launchOptions: {
            webhook: {
              domain: url, // Your Localtunnel/Cloudflare URL
              hookPath: `/bot${token}`, // A secure path to receive updates
            },
          },
          // --- WEBHOOK CONFIGURATION END ---
        };
      },
      inject: [ConfigService],
    }),
    BotModule,
  ],
  controllers: [AdminController],
  providers: [
    WithdrawService, // 👈 ဤနေရာတွင် WithdrawService ကို ထည့်ပေးရပါမည်
    WalletService, // 👈 WalletService ကိုလည်း ထည့်ပေးရပါမည်
    // ... အခြား providers (PrismaService, etc.)
  ],
  exports: [WithdrawService, WalletService],
})
export class AppModule {}
