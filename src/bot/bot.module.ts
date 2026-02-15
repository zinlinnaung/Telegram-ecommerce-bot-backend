import { Module } from '@nestjs/common';
import { BotUpdate } from './bot.update';
import { TopUpScene } from './scenes/topup.scene';
import { UsersModule } from '../users/users.module';
import { ProductsModule } from 'src/products/products.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { TwoDScene } from './scenes/two-d.scene';
import { ThreeDScene } from './scenes/three-d.scene';
import { WithdrawScene } from './scenes/withdraw.scene';
import { HighLowScene } from './scenes/high-low.scene';
import { GamePurchaseScene } from './scenes/game-purchase.scene';

@Module({
  imports: [
    UsersModule, // Allows BotUpdate to use UsersService
    ProductsModule, // Allows BotUpdate to use ProductsService
    WalletModule, // Allows BotUpdate to use WalletService
  ],
  providers: [
    BotUpdate, // The main command/action listener
    TopUpScene, // The Top-Up Wizard logic
    TwoDScene,
    ThreeDScene,
    WithdrawScene,
    HighLowScene,
    GamePurchaseScene,
  ],
})
export class BotModule {}
