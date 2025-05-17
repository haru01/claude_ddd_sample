import { Order, OrderId, CustomerId, OrderRepository, createOrderId } from '../../domain/order/types';

/**
 * インメモリ注文リポジトリの実装
 * テストや開発時に使用する簡易的な実装
 */
export class InMemoryOrderRepository implements OrderRepository {
  private readonly orders: Map<string, Order> = new Map();
  private readonly ordersByCustomer: Map<string, Set<string>> = new Map();

  async save(order: Order): Promise<void> {
    // 注文を保存
    this.orders.set(order.id, order);
    
    // 顧客IDインデックスを更新
    const customerIdStr = order.customerId as string;
    if (!this.ordersByCustomer.has(customerIdStr)) {
      this.ordersByCustomer.set(customerIdStr, new Set());
    }
    this.ordersByCustomer.get(customerIdStr)!.add(order.id as string);
  }

  async findById(id: OrderId): Promise<Order | null> {
    const order = this.orders.get(id as string);
    return order || null;
  }

  async findByCustomerId(customerId: CustomerId): Promise<Order[]> {
    const customerIdStr = customerId as string;
    const orderIds = this.ordersByCustomer.get(customerIdStr);
    
    if (!orderIds) {
      return [];
    }
    
    const orders: Order[] = [];
    for (const orderId of orderIds) {
      const order = this.orders.get(orderId);
      if (order) {
        orders.push(order);
      }
    }
    
    // 作成日時の昇順でソート
    return orders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  nextId(): OrderId {
    return createOrderId();
  }

  // テスト用のヘルパーメソッド
  clear(): void {
    this.orders.clear();
    this.ordersByCustomer.clear();
  }

  getAll(): Order[] {
    return Array.from(this.orders.values());
  }

  size(): number {
    return this.orders.size;
  }
}