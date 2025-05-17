import {
  createOrder,
  addOrderLine,
  placeOrder,
  markAsPaid
} from './domain/order/functions';
import {
  createShipping,
  startPreparation,
  shipOrder,
  deliverShipment
} from './domain/shipping/functions';
import {
  createCustomerId,
  createProductId,
  createPrice,
  createQuantity
} from './domain/order/valueObjects';
import { createOrderId } from './domain/order/valueObjects';
import { OrderLineSchema } from './domain/order/types';
import { AddressSchema } from './domain/shipping/types';

async function example() {
  console.log('=== 関数型DDDサンプル実行 ===\n');

  // 1. 注文の作成
  console.log('1. 新しい注文を作成');
  const customerId = createCustomerId();
  let order = createOrder(customerId);
  console.log(`注文ID: ${order.id}`);
  console.log(`顧客ID: ${order.customerId}`);
  console.log(`ステータス: ${order.status.type}\n`);

  // 2. 商品を注文に追加
  console.log('2. 商品を注文に追加');
  
  // 商品1
  const price1Result = createPrice(1500);
  const quantity1Result = createQuantity(2);
  
  if (!price1Result.success || !quantity1Result.success) {
    throw new Error("値オブジェクトの作成に失敗しました");
  }

  const orderLine1 = OrderLineSchema.parse({
    productId: createProductId(),
    productName: "TypeScriptガイドブック",
    unitPrice: price1Result.value,
    quantity: quantity1Result.value
  });

  const addResult1 = addOrderLine(order, orderLine1);
  if (addResult1.success) {
    order = addResult1.value;
    console.log(`商品追加成功: ${orderLine1.productName}`);
  } else {
    console.error(`エラー: ${addResult1.error}`);
  }

  // 商品2
  const price2Result = createPrice(2800);
  const quantity2Result = createQuantity(1);
  
  if (!price2Result.success || !quantity2Result.success) {
    throw new Error("値オブジェクトの作成に失敗しました");
  }

  const orderLine2 = OrderLineSchema.parse({
    productId: createProductId(),
    productName: "関数型プログラミング入門",
    unitPrice: price2Result.value,
    quantity: quantity2Result.value
  });

  const addResult2 = addOrderLine(order, orderLine2);
  if (addResult2.success) {
    order = addResult2.value;
    console.log(`商品追加成功: ${orderLine2.productName}`);
  } else {
    console.error(`エラー: ${addResult2.error}`);
  }

  console.log(`合計金額: ¥${order.totalAmount}\n`);

  // 3. 注文確定
  console.log('3. 注文を確定');
  const placeResult = placeOrder(order);
  if (placeResult.success) {
    order = placeResult.value;
    console.log(`注文確定成功`);
    console.log(`ステータス: ${order.status.type}`);
    if (order.status.type === "placed") {
      console.log(`確定日時: ${order.status.placedAt.toISOString()}\n`);
    }
  } else {
    console.error(`エラー: ${placeResult.error}`);
  }

  // 4. 支払い処理
  console.log('4. 支払い処理');
  const payResult = markAsPaid(order);
  if (payResult.success) {
    order = payResult.value;
    console.log(`支払い完了`);
    console.log(`ステータス: ${order.status.type}`);
    if (order.status.type === "paid") {
      console.log(`支払い日時: ${order.status.paidAt.toISOString()}\n`);
    }
  } else {
    console.error(`エラー: ${payResult.error}`);
  }

  // 5. 配送の作成
  console.log('5. 配送を作成');
  const address = AddressSchema.parse({
    street: "東京都渋谷区神宮前1-2-3",
    city: "渋谷区",
    state: "東京都",
    postalCode: "150-0001",
    country: "日本"
  });

  let shipping = createShipping(order.id, address, "express");
  console.log(`配送ID: ${shipping.id}`);
  console.log(`配送方法: ${shipping.method}`);
  console.log(`配達予定日: ${shipping.estimatedDeliveryDate?.toISOString()}`);
  console.log(`ステータス: ${shipping.status.type}\n`);

  // 6. 配送処理の進行
  console.log('6. 配送処理を進行');
  
  // 準備開始
  const prepResult = startPreparation(shipping);
  if (prepResult.success) {
    shipping = prepResult.value;
    console.log(`準備開始 - ステータス: ${shipping.status.type}`);
  }

  // 発送
  const shipResult = shipOrder(shipping);
  if (shipResult.success) {
    shipping = shipResult.value;
    console.log(`発送完了 - ステータス: ${shipping.status.type}`);
    if (shipping.status.type === "shipped") {
      console.log(`追跡番号: ${shipping.status.trackingNumber}`);
    }
  }

  // 配達
  const deliverResult = deliverShipment(shipping);
  if (deliverResult.success) {
    shipping = deliverResult.value;
    console.log(`配達完了 - ステータス: ${shipping.status.type}`);
    if (shipping.status.type === "delivered") {
      console.log(`配達日時: ${shipping.status.deliveredAt.toISOString()}`);
    }
  }

  console.log('\n=== 処理完了 ===');
}

// 実行
example().catch(console.error);