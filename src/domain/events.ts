import { z } from 'zod';
import { OrderId } from './order/types';
import { ShippingId, TrackingNumber } from './shipping/types';

// イベントの基底スキーマ
export const DomainEventSchema = z.object({
  eventType: z.string(),
  aggregateId: z.string(),
  occurredAt: z.date()
}).readonly();
export type DomainEvent = z.infer<typeof DomainEventSchema>;

// 注文確定イベント
export const OrderPlacedEventSchema = DomainEventSchema.extend({
  eventType: z.literal("order_placed"),
  aggregateId: z.custom<OrderId>(),
  customerId: z.string(),
  totalAmount: z.number()
}).readonly();
export type OrderPlacedEventType = z.infer<typeof OrderPlacedEventSchema>;

export class OrderPlacedEvent implements OrderPlacedEventType {
  readonly eventType = "order_placed";
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: OrderId,
    public readonly customerId: string,
    public readonly totalAmount: number
  ) {
    this.occurredAt = new Date();
  }

  validate(): OrderPlacedEventType {
    return OrderPlacedEventSchema.parse(this);
  }
}

// 注文支払い完了イベント
export const OrderPaidEventSchema = DomainEventSchema.extend({
  eventType: z.literal("order_paid"),
  aggregateId: z.custom<OrderId>()
}).readonly();
export type OrderPaidEventType = z.infer<typeof OrderPaidEventSchema>;

export class OrderPaidEvent implements OrderPaidEventType {
  readonly eventType = "order_paid";
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: OrderId
  ) {
    this.occurredAt = new Date();
  }

  validate(): OrderPaidEventType {
    return OrderPaidEventSchema.parse(this);
  }
}

// 配送開始イベント
export const ShipmentStartedEventSchema = DomainEventSchema.extend({
  eventType: z.literal("shipment_started"),
  aggregateId: z.custom<ShippingId>(),
  orderId: z.custom<OrderId>(),
  trackingNumber: z.custom<TrackingNumber>()
}).readonly();
export type ShipmentStartedEventType = z.infer<typeof ShipmentStartedEventSchema>;

export class ShipmentStartedEvent implements ShipmentStartedEventType {
  readonly eventType = "shipment_started";
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: ShippingId,
    public readonly orderId: OrderId,
    public readonly trackingNumber: TrackingNumber
  ) {
    this.occurredAt = new Date();
  }

  validate(): ShipmentStartedEventType {
    return ShipmentStartedEventSchema.parse(this);
  }
}

// 配送完了イベント
export const ShipmentDeliveredEventSchema = DomainEventSchema.extend({
  eventType: z.literal("shipment_delivered"),
  aggregateId: z.custom<ShippingId>(),
  orderId: z.custom<OrderId>()
}).readonly();
export type ShipmentDeliveredEventType = z.infer<typeof ShipmentDeliveredEventSchema>;

export class ShipmentDeliveredEvent implements ShipmentDeliveredEventType {
  readonly eventType = "shipment_delivered";
  readonly occurredAt: Date;

  constructor(
    public readonly aggregateId: ShippingId,
    public readonly orderId: OrderId
  ) {
    this.occurredAt = new Date();
  }

  validate(): ShipmentDeliveredEventType {
    return ShipmentDeliveredEventSchema.parse(this);
  }
}