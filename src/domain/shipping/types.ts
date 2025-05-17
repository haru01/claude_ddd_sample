import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { UUID } from "../../shared/types";
import { OrderId } from '../order/types';

// 値オブジェクトとしての識別子
export type ShippingId = UUID & { readonly _brand: unique symbol };
export type TrackingNumber = string & { readonly _brand: unique symbol };

// 値オブジェクト - 住所
export const AddressSchema = z.object({
  street: z.string().min(1).max(100),
  city: z.string().min(1).max(50),
  state: z.string().min(1).max(50),
  postalCode: z.string().regex(/^\d{3}-\d{4}$/, "郵便番号は000-0000の形式でなければなりません"),
  country: z.string().min(1).max(50)
}).readonly();
export type Address = z.infer<typeof AddressSchema>;

// 配送方法
export const ShippingMethodSchema = z.enum(["standard", "express", "overnight"]);
export type ShippingMethod = z.infer<typeof ShippingMethodSchema>;

// 配送の状態を表す代数的データ型
export const ShippingStatusSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pending") }),
  z.object({ type: z.literal("preparing") }),
  z.object({ type: z.literal("shipped"), shippedAt: z.date(), trackingNumber: z.custom<TrackingNumber>() }),
  z.object({ type: z.literal("delivered"), deliveredAt: z.date() }),
  z.object({ type: z.literal("failed"), failedAt: z.date(), reason: z.string() })
]);
export type ShippingStatus = z.infer<typeof ShippingStatusSchema>;

// 集約ルート - 配送
export const ShippingSchema = z.object({
  id: z.custom<ShippingId>(),
  orderId: z.custom<OrderId>(),
  shippingAddress: AddressSchema,
  method: ShippingMethodSchema,
  status: ShippingStatusSchema,
  estimatedDeliveryDate: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date()
}).readonly();
export type Shipping = z.infer<typeof ShippingSchema>;

// ドメインエラー
export const ShippingErrorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("validation_error"), message: z.string() }),
  z.object({ type: z.literal("business_rule_violation"), message: z.string() }),
  z.object({ type: z.literal("not_found"), message: z.string() })
]);
export type ShippingError = z.infer<typeof ShippingErrorSchema>;

// 結果型
export type Result<T> = 
  | { success: true; value: T }
  | { success: false; error: string };

// リポジトリインターフェース
export interface ShippingRepository {
  save: (shipping: Shipping) => Promise<void>;
  findById: (id: ShippingId) => Promise<Shipping | null>;
  findByOrderId: (orderId: OrderId) => Promise<Shipping | null>;
  findByStatus: (status: ShippingStatus["type"]) => Promise<Shipping[]>;
  nextId: () => ShippingId;
}

// リポジトリエラー
export const ShippingRepositoryErrorSchema = z.discriminatedUnion("type", [
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
export type ShippingRepositoryError = z.infer<typeof ShippingRepositoryErrorSchema>;

// スマートコンストラクタパターン - 不変の値オブジェクトを安全に生成

export const createShippingId = (): ShippingId => {
  return uuidv4() as ShippingId;
};

export const createTrackingNumber = (): TrackingNumber => {
  // 実際のシステムでは外部の配送業者APIから取得
  const prefix = "JP";
  const suffix = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  return `${prefix}${suffix}` as TrackingNumber;
};

export const createAddress = (
  street: string,
  city: string,
  state: string,
  postalCode: string,
  country: string
): Result<Address> => {
  try {
    const address = AddressSchema.parse({
      street,
      city,
      state,
      postalCode,
      country
    });

    return {
      success: true,
      value: address
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0].message || "無効な住所です"
      };
    }
    return {
      success: false,
      error: "住所の作成中に不明なエラーが発生しました"
    };
  }
};