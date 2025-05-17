import { pipe } from 'fp-ts/function';
import { z } from 'zod';
import { TaskEither, taskEither, left, right } from '../shared/types';
import { OrderId, OrderRepository, Order } from '../domain/order/types';
import {
  ShippingId,
  Address,
  ShippingMethod,
  ShippingRepository,
  AddressSchema,
  ShippingMethodSchema
} from '../domain/shipping/types';
import { createShipping } from '../domain/shipping/functions';
import { EventBus } from './placeOrderCommand';

// コマンド型
export const CreateShippingCommandSchema = z.object({
  orderId: z.custom<OrderId>(),
  shippingAddress: AddressSchema,
  method: ShippingMethodSchema
}).readonly();

export type CreateShippingCommand = z.infer<typeof CreateShippingCommandSchema>;

// エラー型
export const CreateShippingErrorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("validation_error"), message: z.string() }),
  z.object({ type: z.literal("not_found"), message: z.string() }),
  z.object({ type: z.literal("business_rule_violation"), message: z.string() }),
  z.object({
    type: z.literal("repository_error"),
    message: z.string(),
    cause: z.unknown().optional()
  })
]);

export type CreateShippingError = z.infer<typeof CreateShippingErrorSchema>;

// コマンドハンドラー
export const createCreateShippingCommandHandler = (
  orderRepository: OrderRepository,
  shippingRepository: ShippingRepository,
  eventBus: EventBus
) => {
  return (command: CreateShippingCommand): TaskEither<CreateShippingError, ShippingId> => {
    // バリデーション
    try {
      CreateShippingCommandSchema.parse(command);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError: CreateShippingError = {
          type: "validation_error",
          message: error.errors[0].message
        };
        return taskEither.fromEither(left(validationError));
      }
    }

    return pipe(
      // 1. 注文を取得
      taskEither.fromPromise(
        orderRepository.findById(command.orderId),
        (error): CreateShippingError => ({
          type: "repository_error",
          message: "注文の取得中にエラーが発生しました",
          cause: error
        })
      ),

      // 2. 注文の存在確認
      taskEither.chain((order): TaskEither<CreateShippingError, Order> => {
        if (order === null) {
          return taskEither.fromEither(left({
              type: "not_found" as const,
              message: `注文ID ${command.orderId} が見つかりません`
            }));
        }
        return taskEither.fromEither(right(order));
      }),

      // 3. 注文が支払い済みか確認
      taskEither.chain((order): TaskEither<CreateShippingError, Order> => {
        if (order.status.type !== "paid") {
          return taskEither.fromEither(left({
              type: "business_rule_violation" as const,
              message: "支払い済みの注文のみ配送できます"
            }));
        }
        return taskEither.fromEither(right(order));
      }),

      // 4. 既存の配送がないか確認
      taskEither.chain(() =>
        taskEither.fromPromise(
          shippingRepository.findByOrderId(command.orderId),
          (error): CreateShippingError => ({
            type: "repository_error",
            message: "配送情報の確認中にエラーが発生しました",
            cause: error
          })
        )
      ),

      // 5. 重複チェック
      taskEither.chain((existingShipping): TaskEither<CreateShippingError, null> => {
        if (existingShipping !== null) {
          return taskEither.fromEither(left({
              type: "business_rule_violation" as const,
              message: `注文ID ${command.orderId} の配送は既に存在します`
            }));
        }
        return taskEither.fromEither(right(null));
      }),

      // 6. 配送を作成
      taskEither.chain((): TaskEither<CreateShippingError, ReturnType<typeof createShipping>> => {
        const shipping = createShipping(
          command.orderId,
          command.shippingAddress,
          command.method
        );

        return taskEither.fromEither(right(shipping));
      }),

      // 7. 配送を保存
      taskEither.chain((shipping): TaskEither<CreateShippingError, ShippingId> =>
        taskEither.fromPromise(
          shippingRepository.save(shipping).then(() => shipping.id),
          (error): CreateShippingError => ({
            type: "repository_error" as const,
            message: "配送の保存中にエラーが発生しました",
            cause: error
          })
        )
      )
    );
  };
};