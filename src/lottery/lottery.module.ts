import { Module } from '@nestjs/common';
import { LotteryService } from './lottery.service';

@Module({
  providers: [LotteryService],
})
export class LotteryModule {}
