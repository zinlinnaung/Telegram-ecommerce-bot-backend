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
      // ၁။ Product နှင့် User အခြေအနေ စစ်ဆေးမယ်
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new BadRequestException('Product not found.');

      const user = await tx.user.findUnique({ where: { id: userId } });
      if (Number(user.balance) < Number(product.price))
        throw new BadRequestException('လက်ကျန်ငွေ မလုံလောက်ပါဘူးခင်ဗျာ။');

      // --- LOGIC 1: AUTO PRODUCT (Stock ထဲက Key ယူမည့်စနစ်) ---
      if (product.type === 'AUTO') {
        const availableKey = await tx.productKey.findFirst({
          where: { productId, isUsed: false },
        });

        if (!availableKey)
          throw new BadRequestException(
            'ဒီပစ္စည်းကတော့ လက်ရှိမှာ Stock ပြတ်နေပါတယ်ခင်ဗျ။',
          );

        // Balance နှုတ်ခြင်းနှင့် Key ကို Used လုပ်ခြင်း
        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: product.price } },
        });

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

      // --- LOGIC 2: API PRODUCT (VPN API ကနေ Key တိုက်ရိုက်ထုတ်မည့်စနစ်) ---
      // မှတ်ချက်- API Type ကို enum မှာ ထည့်ထားဖို့ လိုပါတယ်
      else if (product.type === 'API') {
        let generatedKey = '';

        try {
          // ဒီနေရာမှာ သက်ဆိုင်ရာ VPN API ကို လှမ်းခေါ်ရမှာဖြစ်ပါတယ်
          // ဥပမာ - const res = await axios.post('URL', { data });
          // generatedKey = res.data.vpn_key;

          // ဥပမာ အနေနဲ့ Key တစ်ခု Generate လုပ်ပြထားခြင်းဖြစ်သည်
          generatedKey = `API-KEY-${Math.random().toString(36).substring(7).toUpperCase()}`;
        } catch (error) {
          throw new BadRequestException(
            'API မှ Key ထုတ်ယူရာတွင် အမှားအယွင်းရှိနေပါသည်။',
          );
        }

        // Balance နှုတ်မယ်
        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: product.price } },
        });

        // Purchase Record သိမ်းမယ်
        const purchase = await tx.purchase.create({
          data: {
            userId,
            productId,
            amount: product.price,
            status: 'COMPLETED',
          },
        });

        // API ကရလာတဲ့ Key ကို နောက်မှ ပြန်ကြည့်လို့ရအောင် ProductKey ထဲမှာ တန်းသိမ်းမယ်
        await tx.productKey.create({
          data: {
            key: generatedKey,
            productId: productId,
            isUsed: true,
            purchaseId: purchase.id,
          },
        });

        return { type: 'API', product, key: generatedKey };
      }

      // --- LOGIC 3: MANUAL PRODUCT (MLBB, PUBG စသည်ဖြင့်) ---
      else {
        if (!playerId) throw new BadRequestException('Player ID လိုအပ်ပါသည်။');

        // Balance နှုတ်မယ်
        await tx.user.update({
          where: { id: userId },
          data: { balance: { decrement: product.price } },
        });

        // Pending အနေနဲ့ သိမ်းမယ် (Admin က Approve လုပ်ပေးရမှာပါ)
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
}
