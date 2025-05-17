import { z } from 'zod';
import {
  Order,
  OrderId,
  OrderLine,
  OrderStatus,
  CustomerId,
  Price,
  Result,
  OrderSchema,
  OrderLineSchema,
  OrderError,
  OrderRepository,
  createOrderId,
  createPrice
} from './types';

// ファクトリ関数 - 新しい注文を作成
export const createOrder = (customerId: CustomerId): Order => {
  const now = new Date();

  const order = {
    id: createOrderId(),
    customerId,
    lines: [],
    status: { type: "draft" as const },
    totalAmount: 0 as Price,
    createdAt: now,
    updatedAt: now
  };

  // スキーマでバリデーション
  const result = OrderSchema.safeParse(order);
  if (!result.success) {
    throw new Error(result.error.errors[0].message || "注文の作成中にエラーが発生しました");
  }
  return result.data;
};

// 注文明細行を追加する純粋関数
export const addOrderLine = (
  order: Order,
  line: OrderLine
): Result<Order> => {
  // ビジネスルールのバリデーション
  if (order.status.type !== "draft") {
    return {
      success: false,
      error: "下書き状態の注文のみに明細を追加できます"
    };
  }

  // 同じ商品の重複チェック
  const existingLine = order.lines.find(l => l.productId === line.productId);
  if (existingLine) {
    return {
      success: false,
      error: `商品 ${line.productName} は既に注文に含まれています`
    };
  }

  const newLines = [...order.lines, line];
  const totalAmountResult = calculateTotalAmount(newLines);
  
  if (!totalAmountResult.success) {
    return totalAmountResult;
  }

  // 新しい注文オブジェクトを作成し、スキーマでバリデーション
  const result = OrderSchema.safeParse({
    ...order,
    lines: newLines,
    totalAmount: totalAmountResult.value,
    updatedAt: new Date()
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0].message
    };
  }

  return {
    success: true,
    value: result.data
  };
};

// 注文を確定する純粋関数
export const placeOrder = (order: Order): Result<Order> => {
  // ビジネスルールのバリデーション
  if (order.status.type !== "draft") {
    return {
      success: false,
      error: "下書き状態の注文のみ確定できます"
    };
  }

  if (order.lines.length === 0) {
    return {
      success: false,
      error: "明細が空の注文は確定できません"
    };
  }

  const now = new Date();

  const result = OrderSchema.safeParse({
    ...order,
    status: { type: "placed" as const, placedAt: now },
    updatedAt: now
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0].message
    };
  }

  return {
    success: true,
    value: result.data
  };
};

// 注文を支払い済みにする純粋関数
export const markAsPaid = (order: Order): Result<Order> => {
  // ビジネスルールのバリデーション
  if (order.status.type !== "placed") {
    return {
      success: false,
      error: "確定済みの注文のみ支払い済みにできます"
    };
  }

  const now = new Date();

  const result = OrderSchema.safeParse({
    ...order,
    status: { type: "paid" as const, paidAt: now },
    updatedAt: now
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0].message
    };
  }

  return {
    success: true,
    value: result.data
  };
};

// 合計金額を計算するヘルパー関数
const calculateTotalAmount = (lines: ReadonlyArray<OrderLine>): Result<Price> => {
  const total = lines.reduce((sum, line) => {
    return sum + (line.unitPrice * line.quantity);
  }, 0);

  return createPrice(total);
};
