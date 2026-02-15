import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async getCategories() {
    const categories = await this.prisma.product.findMany({
      select: { category: true },
      distinct: ['category'],
    });
    return categories.map((c) => c.category);
  }

  async getProductsByCategory(category: string) {
    return this.prisma.product.findMany({ where: { category } });
  }

  // purchaseProduct ကို playerId နဲ့ serverId ပါ လက်ခံနိုင်အောင် ပြင်လိုက်ပါတယ်
  async purchaseProduct(
    userId: number,
    productId: number,
    playerId?: string,
    serverId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new BadRequestException('Product not found.');

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (Number(user.balance) < Number(product.price))
        throw new BadRequestException('လက်ကျန်ငွေ မလုံလောက်ပါဘူးခင်ဗျာ။');

      // --- LOGIC 1: AUTO PRODUCT (VPN, Netflix etc.) ---
      if (product.type === 'AUTO') {
        const availableKey = await tx.productKey.findFirst({
          where: { productId, isUsed: false },
        });

        if (!availableKey)
          throw new BadRequestException(
            'စိတ်မကောင်းပါဘူးခင်ဗျာ၊ ဒီပစ္စည်းကတော့ လက်ရှိမှာ ပစ္စည်းပြတ်နေပါတယ်ခင်ဗျ။',
          );

        // Balance နှုတ်မယ်
        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: product.price } },
        });

        // Key ကို used လုပ်မယ်
        await tx.productKey.update({
          where: { id: availableKey.id },
          data: { isUsed: true },
        });

        // Purchase Record သိမ်းမယ် (Completed တန်းဖြစ်တယ်)
        const purchase = await tx.purchase.create({
          data: {
            userId,
            productId,
            amount: product.price,
            status: 'COMPLETED',
          },
        });

        return { type: 'AUTO', product, key: availableKey.key };
      }

      // --- LOGIC 2: MANUAL PRODUCT (MLBB, PUBG etc.) ---
      else {
        // Manual အတွက် Player ID မပါရင် အမှားပြမယ်
        if (!playerId) throw new BadRequestException('Player ID လိုအပ်ပါသည်။');

        // Balance နှုတ်မယ်
        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: product.price } },
        });

        // Purchase Record သိမ်းမယ် (Pending အနေနဲ့ သိမ်းမယ်)
        const purchase = await tx.purchase.create({
          data: {
            userId,
            productId,
            amount: product.price,
            playerId: playerId,
            serverId: serverId || null,
            status: 'PENDING', // Admin က အတည်ပြုပေးရမှာမို့လို့ပါ
          },
        });

        return { type: 'MANUAL', product, purchaseId: purchase.id };
      }
    });
  }
}
