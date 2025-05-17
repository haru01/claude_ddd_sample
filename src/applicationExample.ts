import {
  createPlaceOrderCommandHandler,
  PlaceOrderCommand,
  EventBus
} from './application/placeOrderCommand';
import {
  createCreateShippingCommandHandler,
  CreateShippingCommand
} from './application/createShippingCommand';
import { InMemoryOrderRepository } from './infrastructure/repositories/inMemoryOrderRepository';
import { InMemoryShippingRepository } from './infrastructure/repositories/inMemoryShippingRepository';
import {
  createProductId,
  createPrice,
  createQuantity,
  OrderLineSchema
} from './domain/order/types';
import { AddressSchema } from './domain/shipping/types';
import { OrderPlacedEvent } from './domain/events';

// 簡易的なイベントバス実装
class SimpleEventBus implements EventBus {
  private handlers: Map<string, Array<(event: any) => Promise<void>>> = new Map();

  async publish<T>(event: T): Promise<void> {
    console.log(`イベント発行: ${(event as any).constructor.name}`, event);
    
    const eventName = (event as any).constructor.name;
    const eventHandlers = this.handlers.get(eventName) || [];
    
    for (const handler of eventHandlers) {
      await handler(event);
    }
  }

  subscribe(eventName: string, handler: (event: any) => Promise<void>): void {
    const handlers = this.handlers.get(eventName) || [];
    handlers.push(handler);
    this.handlers.set(eventName, handlers);
  }
}

async function applicationExample() {
  console.log('=== アプリケーション層サンプル実行 ===\n');

  // インフラストラクチャのセットアップ
  const orderRepository = new InMemoryOrderRepository();
  const shippingRepository = new InMemoryShippingRepository();
  const eventBus = new SimpleEventBus();

  // イベントハンドラーの登録
  eventBus.subscribe('OrderPlacedEvent', async (event: OrderPlacedEvent) => {
    console.log(`\n注文確定イベントを受信しました:`, {
      orderId: event.aggregateId,
      totalAmount: event.totalAmount
    });
  });

  // コマンドハンドラーの作成
  const placeOrderHandler = createPlaceOrderCommandHandler(orderRepository, eventBus);
  const createShippingHandler = createCreateShippingCommandHandler(
    orderRepository,
    shippingRepository,
    eventBus
  );

  // 1. 注文確定コマンドの実行
  console.log('1. 注文確定コマンドを実行');
  
  // 商品明細を準備
  const price1Result = createPrice(1500);
  const quantity1Result = createQuantity(2);
  const price2Result = createPrice(2800);
  const quantity2Result = createQuantity(1);

  if (!price1Result.success || !quantity1Result.success || 
      !price2Result.success || !quantity2Result.success) {
    throw new Error("値オブジェクトの作成に失敗しました");
  }

  const orderLine1Result = OrderLineSchema.safeParse({
    productId: createProductId(),
    productName: "TypeScript実践ガイド",
    unitPrice: price1Result.value,
    quantity: quantity1Result.value
  });

  if (!orderLine1Result.success) {
    throw new Error("注文明細の作成に失敗しました: " + orderLine1Result.error.errors[0].message);
  }
  const orderLine1 = orderLine1Result.data;

  const orderLine2Result = OrderLineSchema.safeParse({
    productId: createProductId(),
    productName: "関数型プログラミング入門",
    unitPrice: price2Result.value,
    quantity: quantity2Result.value
  });

  if (!orderLine2Result.success) {
    throw new Error("注文明細の作成に失敗しました: " + orderLine2Result.error.errors[0].message);
  }
  const orderLine2 = orderLine2Result.data;

  const placeOrderCommand: PlaceOrderCommand = {
    lines: [orderLine1, orderLine2]
  };

  const placeOrderResult = await placeOrderHandler(placeOrderCommand);

  if (placeOrderResult.type === "left") {
    console.error(`注文確定失敗:`, placeOrderResult.value);
    return;
  }

  const orderId = placeOrderResult.value;
  console.log(`注文確定成功: 注文ID ${orderId}`);

  // 2. 注文を支払い済みに更新（実際の実装では別のコマンドハンドラーが必要）
  console.log('\n2. 注文を支払い済みに更新（シミュレーション）');
  
  // リポジトリから注文を取得して直接更新（本来はMarkAsPaidCommandHandlerを実装すべき）
  const order = await orderRepository.findById(orderId);
  if (order) {
    const paidOrder = {
      ...order,
      status: { type: "paid" as const, paidAt: new Date() },
      updatedAt: new Date()
    };
    await orderRepository.save(paidOrder);
    console.log(`注文 ${orderId} を支払い済みに更新しました`);
  }

  // 3. 配送作成コマンドの実行
  console.log('\n3. 配送作成コマンドを実行');
  
  const shippingAddressResult = AddressSchema.safeParse({
    street: "東京都渋谷区神南1-2-3",
    city: "渋谷区",
    state: "東京都",
    postalCode: "150-0041",
    country: "日本"
  });

  if (!shippingAddressResult.success) {
    throw new Error("住所の作成に失敗しました: " + shippingAddressResult.error.errors[0].message);
  }
  const shippingAddress = shippingAddressResult.data;

  const createShippingCommand: CreateShippingCommand = {
    orderId,
    shippingAddress,
    method: "express"
  };

  const createShippingResult = await createShippingHandler(createShippingCommand);

  if (createShippingResult.type === "left") {
    console.error(`配送作成失敗:`, createShippingResult.value);
    return;
  }

  const shippingId = createShippingResult.value;
  console.log(`配送作成成功: 配送ID ${shippingId}`);

  // 4. リポジトリから情報を取得して表示
  console.log('\n4. 作成されたデータを確認');
  
  const createdOrder = await orderRepository.findById(orderId);
  const createdShipping = await shippingRepository.findById(shippingId);

  if (createdOrder) {
    console.log('\n注文情報:');
    console.log(`- ID: ${createdOrder.id}`);
    console.log(`- ステータス: ${createdOrder.status.type}`);
    console.log(`- 明細数: ${createdOrder.lines.length}`);
    console.log(`- 合計金額: ¥${createdOrder.totalAmount}`);
  }

  if (createdShipping) {
    console.log('\n配送情報:');
    console.log(`- ID: ${createdShipping.id}`);
    console.log(`- 注文ID: ${createdShipping.orderId}`);
    console.log(`- 配送方法: ${createdShipping.method}`);
    console.log(`- ステータス: ${createdShipping.status.type}`);
    console.log(`- 配達予定日: ${createdShipping.estimatedDeliveryDate?.toLocaleDateString('ja-JP')}`);
  }

  // 5. ステータスによる検索
  console.log('\n5. ステータスによる検索');
  
  const paidOrders = await orderRepository.findByStatus("paid");
  console.log(`支払い済み注文数: ${paidOrders.length}`);
  
  const pendingShippings = await shippingRepository.findByStatus("pending");
  console.log(`保留中の配送数: ${pendingShippings.length}`);

  console.log('\n=== アプリケーション層サンプル実行完了 ===');
}

// エラーハンドリング付きで実行
applicationExample()
  .then(() => console.log('\nサンプル実行が正常に完了しました'))
  .catch(error => {
    console.error('\nエラーが発生しました:', error);
    process.exit(1);
  });