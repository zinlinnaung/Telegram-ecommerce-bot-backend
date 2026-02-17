// deposit.dto.ts
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDepositDto {
  @IsNotEmpty()
  @IsString()
  amount: string;

  @IsNotEmpty()
  @IsString()
  method: string;

  @IsNotEmpty()
  @IsString()
  telegramId: string;
}
