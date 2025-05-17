import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createOrder,
  addOrderLine,
  placeOrder,
  markAsPaid
} from '../../../src/domain/order/functions';
import {
  CustomerId,
  ProductId,
  Price,
  Quantity,
  OrderSchema,
  OrderLineSchema
} from '../../../src/domain/order/types';
import {
  createCustomerId,
  createProductId,
  createPrice,
  createQuantity
} from '../../../src/domain/order/valueObjects';

describe('注文ドメイン関数', () => {
  describe('createOrder', () => {
    it('有効なカスタマーIDで新しい注文を作成できる', () => {
      // Arrange
      const customerId = createCustomerId();

      // Act
      const order = createOrder(customerId);

      // Assert
      expect(() => OrderSchema.parse(order)).not.toThrow();
      expect(order.id).toBeDefined();
      expect(order.customerId).toBe(customerId);
      expect(order.lines).toEqual([]);
      expect(order.status).toEqual({ type: "draft" });
      expect(order.totalAmount).toBe(0);
      expect(order.createdAt).toBeInstanceOf(Date);
      expect(order.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('addOrderLine', () => {
    it('下書き状態の注文に明細を追加できる', () => {
      // Arrange
      const customerId = createCustomerId();
      const order = createOrder(customerId);
      
      const priceResult = createPrice(1000);
      const quantityResult = createQuantity(2);
      
      if (!priceResult.success || !quantityResult.success) {
        throw new Error("値オブジェクトの作成に失敗しました");
      }

      const orderLine = OrderLineSchema.parse({
        productId: createProductId(),
        productName: "テスト商品",
        unitPrice: priceResult.value,
        quantity: quantityResult.value
      });

      // Act
      const result = addOrderLine(order, orderLine);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(() => OrderSchema.parse(result.value)).not.toThrow();
        expect(result.value.lines.length).toBe(1);
        expect(result.value.lines[0]).toEqual(orderLine);
        expect(result.value.totalAmount).toBe(2000);
      }
    });

    it('確定済みの注文に明細を追加できない', () => {
      // Arrange
      const customerId = createCustomerId();
      let order = createOrder(customerId);
      
      const priceResult = createPrice(1000);
      const quantityResult = createQuantity(1);
      
      if (!priceResult.success || !quantityResult.success) {
        throw new Error("値オブジェクトの作成に失敗しました");
      }

      const orderLine = OrderLineSchema.parse({
        productId: createProductId(),
        productName: "テスト商品",
        unitPrice: priceResult.value,
        quantity: quantityResult.value
      });

      // 注文に明細を追加して確定する
      const addResult = addOrderLine(order, orderLine);
      if (addResult.success) {
        const placeResult = placeOrder(addResult.value);
        if (placeResult.success) {
          order = placeResult.value;
        }
      }

      // Act
      const result = addOrderLine(order, orderLine);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("下書き状態の注文のみに明細を追加できます");
      }
    });
  });

  describe('placeOrder', () => {
    it('明細がある下書き注文を確定できる', () => {
      // Arrange
      const customerId = createCustomerId();
      let order = createOrder(customerId);
      
      const priceResult = createPrice(1000);
      const quantityResult = createQuantity(2);
      
      if (!priceResult.success || !quantityResult.success) {
        throw new Error("値オブジェクトの作成に失敗しました");
      }

      const orderLine = OrderLineSchema.parse({
        productId: createProductId(),
        productName: "テスト商品",
        unitPrice: priceResult.value,
        quantity: quantityResult.value
      });

      const addResult = addOrderLine(order, orderLine);
      if (addResult.success) {
        order = addResult.value;
      }

      // Act
      const result = placeOrder(order);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(() => OrderSchema.parse(result.value)).not.toThrow();
        expect(result.value.status.type).toBe("placed");
        if (result.value.status.type === "placed") {
          expect(result.value.status.placedAt).toBeInstanceOf(Date);
        }
      }
    });

    it('明細が空の注文は確定できない', () => {
      // Arrange
      const customerId = createCustomerId();
      const order = createOrder(customerId);

      // Act
      const result = placeOrder(order);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("明細が空の注文は確定できません");
      }
    });
  });
});