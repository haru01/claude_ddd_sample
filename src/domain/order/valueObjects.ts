import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  OrderId,
  CustomerId,
  ProductId,
  Price,
  Quantity,
  Result,
  PriceSchema,
  QuantitySchema
} from './types';

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