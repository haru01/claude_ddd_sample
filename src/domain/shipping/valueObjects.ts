import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  ShippingId,
  TrackingNumber,
  Address,
  Result,
  AddressSchema
} from './types';

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