import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async getProductsByCategory(category: string) {
    return this.prisma.product.findMany({ where: { category } });
  }

  async getPurchaseHistory(userId: number) {
    return this.prisma.purchase.findMany({
      where: { userId },
      include: {
        product: true,
        productKey: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async purchaseProduct(
    userId: number,
    productId: number,
    playerId?: string,
    serverId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // ၁။ Product နှင့် User အခြေအနေ စစ်ဆေးမယ်
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new BadRequestException('Product not found.');

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new BadRequestException('User not found.');

      // --- [NEW] FREE TRIAL CHECK ---
      // အကယ်၍ product က trial ဖြစ်နေရင် အရင်ဝယ်ဖူးသလား စစ်မယ်
      if (product.isFreeTrial) {
        const alreadyClaimed = await tx.purchase.findFirst({
          where: {
            userId: userId,
            productId: productId,
          },
        });

        if (alreadyClaimed) {
          throw new BadRequestException(
            'ဒီ Free Trial ကို တစ်ခါပဲ ရယူခွင့်ရှိပါတယ်ခင်ဗျာ။',
          );
        }
      }

      // ဈေးနှုန်းရှိမှသာ လက်ကျန်ငွေ ရှိ/မရှိ စစ်မယ်
      if (
        Number(product.price) > 0 &&
        Number(user.balance) < Number(product.price)
      ) {
        throw new BadRequestException('လက်ကျန်ငွေ မလုံလောက်ပါဘူးခင်ဗျာ။');
      }

      // --- LOGIC 1: AUTO PRODUCT ---
      if (product.type === 'AUTO') {
        const availableKey = await tx.productKey.findFirst({
          where: { productId, isUsed: false },
        });

        if (!availableKey)
          throw new BadRequestException(
            'ဒီပစ္စည်းကတော့ လက်ရှိမှာ Stock ပြတ်နေပါတယ်ခင်ဗျ။',
          );

        // Price ရှိမှသာ Balance နှုတ်မယ်
        if (Number(product.price) > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { balance: { decrement: product.price } },
          });
        }

        await tx.productKey.update({
          where: { id: availableKey.id },
          data: { isUsed: true },
        });

        await tx.purchase.create({
          data: {
            userId,
            productId,
            amount: product.price,
            status: 'COMPLETED',
          },
        });

        return { type: 'AUTO', product, key: availableKey.key };
      }

      // --- LOGIC 2: API PRODUCT (Hiddify VPN API Integration) ---
      else if (product.type === 'API') {
        let subscriptionUrl = '';

        try {
          const hiddifyRes = await axios.post(
            'https://net.notuse.xyz/eMTscaVR0wZgDa99t1Itsd/api/v2/admin/user/',
            {
              name: `${user.id}_${product.name}_${Date.now()}`,
              usage_limit_GB: product.usageLimitGB || 1, // Trial အတွက်ဆို ၁ GB
              package_days: product.packageDays || 30, // Trial အတွက်ဆို ၃၀ ရက်
              mode: 'no_reset',
              comment: `Bought by UserID: ${user.id} | Product: ${product.name} ${product.isFreeTrial ? '(TRIAL)' : ''}`,
            },
            {
              headers: {
                'Hiddify-API-Key': '2b4b13d9-faf4-46ac-8d36-09652db0beac',
                'Content-Type': 'application/json',
              },
            },
          );

          const userUuid = hiddifyRes.data.uuid;
          subscriptionUrl = `https://net.notuse.xyz/MpLQ6YVffFqqn4pxPMrYz7cDe/${userUuid}`;
        } catch (error: any) {
          console.error(
            'Hiddify API Error:',
            error.response?.data || error.message,
          );
          throw new BadRequestException(
            'VPN API မှ Key ထုတ်ယူရာတွင် အမှားအယွင်းရှိနေပါသည်။',
          );
        }

        // Price ရှိမှသာ Balance နှုတ်မယ်
        if (Number(product.price) > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { balance: { decrement: product.price } },
          });
        }

        const purchase = await tx.purchase.create({
          data: {
            userId,
            productId,
            amount: product.price,
            status: 'COMPLETED',
          },
        });

        await tx.productKey.create({
          data: {
            key: subscriptionUrl,
            productId: productId,
            isUsed: true,
            purchaseId: purchase.id,
          },
        });

        return { type: 'API', product, key: subscriptionUrl };
      }

      // --- LOGIC 3: MANUAL PRODUCT ---
      else {
        if (!playerId) throw new BadRequestException('Player ID လိုအပ်ပါသည်။');

        if (Number(product.price) > 0) {
          await tx.user.update({
            where: { id: userId },
            data: { balance: { decrement: product.price } },
          });
        }

        const purchase = await tx.purchase.create({
          data: {
            userId,
            productId,
            amount: product.price,
            playerId: playerId,
            serverId: serverId || null,
            status: 'PENDING',
          },
        });

        return { type: 'MANUAL', product, purchaseId: purchase.id };
      }
    });
  }

  async getCategories() {
    const products = await this.prisma.product.findMany({
      select: { category: true },
      distinct: ['category'],
    });
    return products.map((p) => p.category);
  }

  async getSubCategories(category: string) {
    const products = await this.prisma.product.findMany({
      where: { category },
      select: { subCategory: true },
      distinct: ['subCategory'],
    });
    return products.map((p) => p.subCategory).filter(Boolean);
  }

  async getProductsBySubCategory(category: string, subCategory: string) {
    return this.prisma.product.findMany({
      where: {
        category,
        subCategory,
      },
    });
  }
}
