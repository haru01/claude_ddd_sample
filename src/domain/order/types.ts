import { z } from 'zod';
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