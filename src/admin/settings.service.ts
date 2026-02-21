import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service'; // Adjust path if needed

@Injectable()
export class SettingsService implements OnModuleInit {
  // This is your in-memory cache
  private blocked2DNumbers: string[] = [];

  constructor(private readonly prisma: PrismaService) {}

  // Automatically runs when the NestJS app starts
  async onModuleInit() {
    await this.refreshCache();
  }

  // Fetch from DB and store in memory
  private async refreshCache() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'BLOCKED_2D_NUMBERS' },
    });
    this.blocked2DNumbers = setting ? JSON.parse(setting.value) : [];
    console.log(`[Cache] Blocked numbers loaded: ${this.blocked2DNumbers}`);
  }

  // ⚡ Instant read from memory (No DB call!)
  getBlockedNumbers(): string[] {
    return this.blocked2DNumbers;
  }

  // Update both the Database and the Cache
  async updateBlockedNumbers(numbers: string[]) {
    await this.prisma.systemSetting.upsert({
      where: { key: 'BLOCKED_2D_NUMBERS' },
      update: { value: JSON.stringify(numbers) },
      create: { key: 'BLOCKED_2D_NUMBERS', value: JSON.stringify(numbers) },
    });

    // Update the in-memory cache immediately
    this.blocked2DNumbers = numbers;

    return this.blocked2DNumbers;
  }
}
