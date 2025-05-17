import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createShipping,
  startPreparation,
  shipOrder,
  deliverShipment
} from '../../../src/domain/shipping/functions';
import {
  ShippingSchema,
  ShippingMethod,
  Address,
  AddressSchema
} from '../../../src/domain/shipping/types';
import { createOrderId } from '../../../src/domain/order/valueObjects';

describe('配送ドメイン関数', () => {
  const createTestAddress = (): Address => {
    return AddressSchema.parse({
      street: "東京都XXX区YYY1-1-1",
      city: "XXX区",
      state: "東京都",
      postalCode: "100-0001",
      country: "日本"
    });
  };

  describe('createShipping', () => {
    it('有効な注文IDと住所で新しい配送を作成できる', () => {
      // Arrange
      const orderId = createOrderId();
      const address = createTestAddress();
      const method: ShippingMethod = "standard";

      // Act
      const shipping = createShipping(orderId, address, method);

      // Assert
      expect(() => ShippingSchema.parse(shipping)).not.toThrow();
      expect(shipping.id).toBeDefined();
      expect(shipping.orderId).toBe(orderId);
      expect(shipping.shippingAddress).toEqual(address);
      expect(shipping.method).toBe(method);
      expect(shipping.status).toEqual({ type: "pending" });
      expect(shipping.estimatedDeliveryDate).toBeInstanceOf(Date);
      expect(shipping.createdAt).toBeInstanceOf(Date);
      expect(shipping.updatedAt).toBeInstanceOf(Date);
    });

    it('配送方法によって配達予定日が異なる', () => {
      // Arrange
      const orderId = createOrderId();
      const address = createTestAddress();
      const now = new Date();

      // Act
      const standardShipping = createShipping(orderId, address, "standard");
      const expressShipping = createShipping(orderId, address, "express");
      const overnightShipping = createShipping(orderId, address, "overnight");

      // Assert
      const standardDays = Math.round((standardShipping.estimatedDeliveryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const expressDays = Math.round((expressShipping.estimatedDeliveryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const overnightDays = Math.round((overnightShipping.estimatedDeliveryDate!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      expect(standardDays).toBeGreaterThanOrEqual(6);
      expect(standardDays).toBeLessThanOrEqual(7);
      expect(expressDays).toBeGreaterThanOrEqual(2);
      expect(expressDays).toBeLessThanOrEqual(3);
      expect(overnightDays).toBeGreaterThanOrEqual(0);
      expect(overnightDays).toBeLessThanOrEqual(1);
    });
  });

  describe('startPreparation', () => {
    it('保留中の配送の準備を開始できる', () => {
      // Arrange
      const orderId = createOrderId();
      const address = createTestAddress();
      const shipping = createShipping(orderId, address, "standard");

      // Act
      const result = startPreparation(shipping);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(() => ShippingSchema.parse(result.value)).not.toThrow();
        expect(result.value.status).toEqual({ type: "preparing" });
      }
    });

    it('準備中の配送の準備を再度開始できない', () => {
      // Arrange
      const orderId = createOrderId();
      const address = createTestAddress();
      let shipping = createShipping(orderId, address, "standard");

      const prepResult = startPreparation(shipping);
      if (prepResult.success) {
        shipping = prepResult.value;
      }

      // Act
      const result = startPreparation(shipping);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("保留中の配送のみ準備を開始できます");
      }
    });
  });

  describe('shipOrder', () => {
    it('準備中の配送を発送できる', () => {
      // Arrange
      const orderId = createOrderId();
      const address = createTestAddress();
      let shipping = createShipping(orderId, address, "standard");

      const prepResult = startPreparation(shipping);
      if (prepResult.success) {
        shipping = prepResult.value;
      }

      // Act
      const result = shipOrder(shipping);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(() => ShippingSchema.parse(result.value)).not.toThrow();
        expect(result.value.status.type).toBe("shipped");
        if (result.value.status.type === "shipped") {
          expect(result.value.status.shippedAt).toBeInstanceOf(Date);
          expect(result.value.status.trackingNumber).toBeDefined();
          expect(result.value.status.trackingNumber).toMatch(/^JP\d{9}$/);
        }
      }
    });
  });

  describe('deliverShipment', () => {
    it('発送済みの配送を配達できる', () => {
      // Arrange
      const orderId = createOrderId();
      const address = createTestAddress();
      let shipping = createShipping(orderId, address, "standard");

      // 準備して発送
      const prepResult = startPreparation(shipping);
      if (prepResult.success) {
        const shipResult = shipOrder(prepResult.value);
        if (shipResult.success) {
          shipping = shipResult.value;
        }
      }

      // Act
      const result = deliverShipment(shipping);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(() => ShippingSchema.parse(result.value)).not.toThrow();
        expect(result.value.status.type).toBe("delivered");
        if (result.value.status.type === "delivered") {
          expect(result.value.status.deliveredAt).toBeInstanceOf(Date);
        }
      }
    });
  });
});