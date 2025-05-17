import { z } from 'zod';
import {
  Shipping,
  ShippingId,
  ShippingStatus,
  ShippingMethod,
  Address,
  Result,
  ShippingSchema
} from './types';
import { OrderId } from '../order/types';
import {
  createShippingId,
  createTrackingNumber
} from './valueObjects';

// ファクトリ関数 - 新しい配送を作成
export const createShipping = (
  orderId: OrderId,
  shippingAddress: Address,
  method: ShippingMethod
): Shipping => {
  const now = new Date();
  const estimatedDeliveryDate = calculateEstimatedDeliveryDate(method, now);

  const shipping = {
    id: createShippingId(),
    orderId,
    shippingAddress,
    method,
    status: { type: "pending" as const },
    estimatedDeliveryDate,
    createdAt: now,
    updatedAt: now
  };

  // スキーマでバリデーション
  return ShippingSchema.parse(shipping);
};

// 配送の準備を開始する純粋関数
export const startPreparation = (shipping: Shipping): Result<Shipping> => {
  // ビジネスルールのバリデーション
  if (shipping.status.type !== "pending") {
    return {
      success: false,
      error: "保留中の配送のみ準備を開始できます"
    };
  }

  try {
    const updatedShipping = ShippingSchema.parse({
      ...shipping,
      status: { type: "preparing" as const },
      updatedAt: new Date()
    });

    return {
      success: true,
      value: updatedShipping
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
      error: "配送準備の開始中に不明なエラーが発生しました"
    };
  }
};

// 配送を発送する純粋関数
export const shipOrder = (shipping: Shipping): Result<Shipping> => {
  // ビジネスルールのバリデーション
  if (shipping.status.type !== "preparing") {
    return {
      success: false,
      error: "準備中の配送のみ発送できます"
    };
  }

  const now = new Date();
  const trackingNumber = createTrackingNumber();

  try {
    const updatedShipping = ShippingSchema.parse({
      ...shipping,
      status: {
        type: "shipped" as const,
        shippedAt: now,
        trackingNumber
      },
      updatedAt: now
    });

    return {
      success: true,
      value: updatedShipping
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
      error: "配送の発送処理中に不明なエラーが発生しました"
    };
  }
};

// 配送を完了する純粋関数
export const deliverShipment = (shipping: Shipping): Result<Shipping> => {
  // ビジネスルールのバリデーション
  if (shipping.status.type !== "shipped") {
    return {
      success: false,
      error: "発送済みの配送のみ配達できます"
    };
  }

  const now = new Date();

  try {
    const updatedShipping = ShippingSchema.parse({
      ...shipping,
      status: { type: "delivered" as const, deliveredAt: now },
      updatedAt: now
    });

    return {
      success: true,
      value: updatedShipping
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
      error: "配送の完了処理中に不明なエラーが発生しました"
    };
  }
};

// 配達予定日を計算するヘルパー関数
const calculateEstimatedDeliveryDate = (
  method: ShippingMethod,
  from: Date
): Date => {
  const date = new Date(from);
  
  switch (method) {
    case "standard":
      date.setDate(date.getDate() + 7);
      break;
    case "express":
      date.setDate(date.getDate() + 3);
      break;
    case "overnight":
      date.setDate(date.getDate() + 1);
      break;
  }
  
  return date;
};

// リポジトリインターフェース
export interface ShippingRepository {
  save: (shipping: Shipping) => Promise<void>;
  findById: (id: ShippingId) => Promise<Shipping | null>;
  findByOrderId: (orderId: OrderId) => Promise<Shipping | null>;
  findByStatus: (status: ShippingStatus["type"]) => Promise<Shipping[]>;
}