import { pipe } from 'fp-ts/function';
import { z } from 'zod';
import { TaskEither, taskEither } from '../shared/types';
import {
  OrderId,
  OrderLine,
  OrderLineSchema,
  OrderRepository
} from '../domain/order/types';
import {
  createOrder,
  addOrderLine,
  placeOrder
} from '../domain/order/functions';
import { createCustomerId } from '../domain/order/valueObjects';
import { OrderPlacedEvent } from '../domain/events';

// コマンド型
export const PlaceOrderCommandSchema = z.object({
  lines: z.array(OrderLineSchema).min(1)
}).readonly();

export type PlaceOrderCommand = z.infer<typeof PlaceOrderCommandSchema>;

// エラー型
export const PlaceOrderErrorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("validation_error"), message: z.string() }),
  z.object({ type: z.literal("business_rule_violation"), message: z.string() }),
  z.object({
    type: z.literal("repository_error"),
    message: z.string(),
    cause: z.unknown().optional()
  })
]);

export type PlaceOrderError = z.infer<typeof PlaceOrderErrorSchema>;

// イベントバスのインターフェース
export interface EventBus {
  publish: <T>(event: T) => Promise<void>;
}

// コマンドハンドラー
export const createPlaceOrderCommandHandler = (
  orderRepository: OrderRepository,
  eventBus: EventBus
) => {
  return (command: PlaceOrderCommand): TaskEither<PlaceOrderError, OrderId> => {
    // バリデーション
    try {
      PlaceOrderCommandSchema.parse(command);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError: PlaceOrderError = {
          type: "validation_error",
          message: error.errors[0].message
        };
        return taskEither.fromEither({ type: "left", value: validationError });
      }
    }

    // 注文の作成処理
    return pipe(
      // 1. 新しい注文を作成
      taskEither.fromEither({
        type: "right" as const,
        value: createOrder(createCustomerId())
      }),

      // 2. 注文明細を追加
      taskEither.chain(order => {
        let currentOrder = order;
        
        for (const line of command.lines) {
          const result = addOrderLine(currentOrder, line);
          if (!result.success) {
            return taskEither.fromEither({
              type: "left" as const,
              value: {
                type: "business_rule_violation" as const,
                message: result.error
              }
            });
          }
          currentOrder = result.value;
        }
        
        return taskEither.fromEither({
          type: "right" as const,
          value: currentOrder
        });
      }),

      // 3. 注文を確定
      taskEither.chain(order => {
        const result = placeOrder(order);
        
        if (!result.success) {
          return taskEither.fromEither({
            type: "left" as const,
            value: {
              type: "business_rule_violation" as const,
              message: result.error
            }
          });
        }
        
        return taskEither.fromEither({
          type: "right" as const,
          value: result.value
        });
      }),

      // 4. 注文を保存
      taskEither.chain(order =>
        taskEither.fromPromise(
          orderRepository.save(order).then(() => order),
          (error): PlaceOrderError => ({
            type: "repository_error",
            message: "注文の保存中にエラーが発生しました",
            cause: error
          })
        )
      ),

      // 5. イベントを発行
      taskEither.chain(order => {
        const event = new OrderPlacedEvent(
          order.id,
          order.customerId,
          order.totalAmount
        );

        return taskEither.fromPromise(
          eventBus.publish(event).then(() => order.id),
          (error): PlaceOrderError => ({
            type: "repository_error",
            message: "イベントの発行中にエラーが発生しました",
            cause: error
          })
        );
      })
    );
  };
};