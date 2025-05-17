import { z } from 'zod';
import {
  Shipping,
  ShippingId,
  ShippingStatus,
  ShippingMethod,
  Address,
  Result,
  ShippingSchema,
  ShippingRepository,
  createShippingId,
  createTrackingNumber
} from './types';
import { OrderId } from '../order/types';

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
  const result = ShippingSchema.safeParse(shipping);
  if (!result.success) {
    throw new Error(result.error.errors[0].message || "配送の作成中にエラーが発生しました");
  }
  return result.data;
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

  const result = ShippingSchema.safeParse({
    ...shipping,
    status: { type: "preparing" as const },
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

  const result = ShippingSchema.safeParse({
    ...shipping,
    status: {
      type: "shipped" as const,
      shippedAt: now,
      trackingNumber
    },
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

  const result = ShippingSchema.safeParse({
    ...shipping,
    status: { type: "delivered" as const, deliveredAt: now },
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
