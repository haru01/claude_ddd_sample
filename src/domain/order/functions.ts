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
  return OrderSchema.parse(order);
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

  try {
    const newLines = [...order.lines, line];
    const totalAmount = calculateTotalAmount(newLines);

    // 新しい注文オブジェクトを作成し、スキーマでバリデーション
    const updatedOrder = OrderSchema.parse({
      ...order,
      lines: newLines,
      totalAmount,
      updatedAt: new Date()
    });

    return {
      success: true,
      value: updatedOrder
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0].message
      };
    }
    return {
      success: false,
      error: "注文の更新中に不明なエラーが発生しました"
    };
  }
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

  try {
    const updatedOrder = OrderSchema.parse({
      ...order,
      status: { type: "placed" as const, placedAt: now },
      updatedAt: now
    });

    return {
      success: true,
      value: updatedOrder
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0].message
      };
    }
    return {
      success: false,
      error: "注文の確定中に不明なエラーが発生しました"
    };
  }
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

  try {
    const updatedOrder = OrderSchema.parse({
      ...order,
      status: { type: "paid" as const, paidAt: now },
      updatedAt: now
    });

    return {
      success: true,
      value: updatedOrder
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0].message
      };
    }
    return {
      success: false,
      error: "注文の支払い処理中に不明なエラーが発生しました"
    };
  }
};

// 合計金額を計算するヘルパー関数
const calculateTotalAmount = (lines: ReadonlyArray<OrderLine>): Price => {
  const total = lines.reduce((sum, line) => {
    return sum + (line.unitPrice * line.quantity);
  }, 0);

  const priceResult = createPrice(total);
  if (!priceResult.success) {
    throw new Error(priceResult.error);
  }

  return priceResult.value;
};

// リポジトリインターフェース
export interface OrderRepository {
  save: (order: Order) => Promise<void>;
  findById: (id: OrderId) => Promise<Order | null>;
  findByStatus: (status: OrderStatus["type"]) => Promise<Order[]>;
}