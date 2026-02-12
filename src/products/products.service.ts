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

  async purchaseProduct(userId: number, productId: number) {
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      const availableKey = await tx.productKey.findFirst({
        where: { productId, isUsed: false },
      });

      if (!availableKey)
        throw new BadRequestException(
          'စိတ်မကောင်းပါဘူးခင်ဗျာ၊ ဒီပစ္စည်းကတော့ လက်ရှိမှာ ပစ္စည်းပြတ်နေပါတယ်ခင်ဗျ။',
        );

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (Number(user.balance) < Number(product.price))
        throw new BadRequestException('လက်ကျန်ငွေ မလုံလောက်ပါဘူးခင်ဗျာ။');

      await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: product.price } },
      });
      await tx.productKey.update({
        where: { id: availableKey.id },
        data: { isUsed: true },
      });
      const purchase = await tx.purchase.create({
        data: { userId, productId, amount: product.price },
      });

      return { product, key: availableKey.key };
    });
  }
}
