import { OrderId } from '../../domain/order/types';
import { Shipping, ShippingId, ShippingRepository, createShippingId } from '../../domain/shipping/types';

/**
 * インメモリ配送リポジトリの実装
 * テストや開発時に使用する簡易的な実装
 */
export class InMemoryShippingRepository implements ShippingRepository {
  private readonly shippings: Map<string, Shipping> = new Map();
  private readonly shippingsByOrder: Map<string, string> = new Map();

  async save(shipping: Shipping): Promise<void> {
    // 配送情報を保存
    this.shippings.set(shipping.id as string, shipping);
    
    // 注文IDインデックスを更新
    this.shippingsByOrder.set(shipping.orderId as string, shipping.id as string);
  }

  async findById(id: ShippingId): Promise<Shipping | null> {
    const shipping = this.shippings.get(id as string);
    return shipping || null;
  }

  async findByOrderId(orderId: OrderId): Promise<Shipping | null> {
    const shippingId = this.shippingsByOrder.get(orderId as string);
    
    if (!shippingId) {
      return null;
    }
    
    const shipping = this.shippings.get(shippingId);
    return shipping || null;
  }

  nextId(): ShippingId {
    return createShippingId();
  }

  // テスト用のヘルパーメソッド
  clear(): void {
    this.shippings.clear();
    this.shippingsByOrder.clear();
  }

  getAll(): Shipping[] {
    return Array.from(this.shippings.values());
  }

  size(): number {
    return this.shippings.size;
  }
}