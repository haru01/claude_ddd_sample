import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { UUID } from "../../shared/types";

// 値オブジェクトとしての識別子
export type OrderId = UUID & { readonly _brand: unique symbol };
export type CustomerId = UUID & { readonly _brand: unique symbol };
export type ProductId = UUID & { readonly _brand: unique symbol };

// 値オブジェクト - 価格
export const PriceSchema = z.number()
  .nonnegative("価格は負の値にできません")
  .max(999999.99, "価格は999,999.99を超えることはできません")
  .transform(price => Math.round(price * 100) / 100); // 小数点第2位まで
export type Price = z.infer<typeof PriceSchema> & { readonly _brand: unique symbol };

// 値オブジェクト - 数量
export const QuantitySchema = z.number()
  .int("数量は整数でなければなりません")
  .positive("数量は正の値でなければなりません")
  .max(9999, "数量は9999を超えることはできません");
export type Quantity = z.infer<typeof QuantitySchema> & { readonly _brand: unique symbol };

// 注文明細行
export const OrderLineSchema = z.object({
  productId: z.custom<ProductId>(),
  productName: z.string().min(1).max(100),
  unitPrice: z.custom<Price>(),
  quantity: z.custom<Quantity>()
}).readonly();
export type OrderLine = z.infer<typeof OrderLineSchema>;

// 注文の状態を表す代数的データ型
export const OrderStatusSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draft") }),
  z.object({ type: z.literal("placed"), placedAt: z.date() }),
  z.object({ type: z.literal("paid"), paidAt: z.date() }),
  z.object({ type: z.literal("cancelled"), cancelledAt: z.date(), reason: z.string() })
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

// 集約ルート - 注文
export const OrderSchema = z.object({
  id: z.custom<OrderId>(),
  customerId: z.custom<CustomerId>(),
  lines: z.array(OrderLineSchema).readonly(),
  status: OrderStatusSchema,
  totalAmount: z.custom<Price>(),
  createdAt: z.date(),
  updatedAt: z.date()
}).readonly();
export type Order = z.infer<typeof OrderSchema>;

// ドメインエラー
export const OrderErrorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("validation_error"), message: z.string() }),
  z.object({ type: z.literal("business_rule_violation"), message: z.string() }),
  z.object({ type: z.literal("not_found"), message: z.string() })
]);
export type OrderError = z.infer<typeof OrderErrorSchema>;

// 結果型
export const ResultSchema = <T>(schema: z.ZodType<T>) => z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), value: schema }),
  z.object({ success: z.literal(false), error: z.string() })
]);
export type Result<T> = z.infer<ReturnType<typeof ResultSchema<T>>>;

// リポジトリインターフェース
export interface OrderRepository {
  save: (order: Order) => Promise<void>;
  findById: (id: OrderId) => Promise<Order | null>;
  findByCustomerId: (customerId: CustomerId) => Promise<Order[]>;
  findByStatus: (status: OrderStatus["type"]) => Promise<Order[]>;
  nextId: () => OrderId;
}

// リポジトリエラー
export const RepositoryErrorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("not_found"),
    message: z.string()
  }),
  z.object({
    type: z.literal("database_error"),
    message: z.string(),
    cause: z.unknown().optional()
  })
]);
export type RepositoryError = z.infer<typeof RepositoryErrorSchema>;

// スマートコンストラクタパターン - 不変の値オブジェクトを安全に生成

export const createOrderId = (): OrderId => {
  return uuidv4() as OrderId;
};

export const createCustomerId = (): CustomerId => {
  return uuidv4() as CustomerId;
};

export const createProductId = (): ProductId => {
  return uuidv4() as ProductId;
};

export const createPrice = (value: number): Result<Price> => {
  const result = PriceSchema.safeParse(value);

  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0].message || "無効な価格です"
    };
  }

  return {
    success: true,
    value: result.data as Price
  };
};

export const createQuantity = (value: number): Result<Quantity> => {
  const result = QuantitySchema.safeParse(value);

  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0].message || "無効な数量です"
    };
  }

  return {
    success: true,
    value: result.data as Quantity
  };
};