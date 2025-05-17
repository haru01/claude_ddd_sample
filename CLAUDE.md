# Claude - TypeScriptによる関数型ドメイン駆動設計サンプル

## 1. はじめに
本プロジェクトは、TypeScriptを使用した関数型プログラミングパラダイムによるドメイン駆動設計（DDD）の実装サンプルです。オブジェクト指向DDDとは異なり、関数型DDDでは不変性、副作用の分離、型駆動設計を中心に据えています。

### 1.1 目的
- TypeScriptによる関数型プログラミングとDDDを組み合わせた実践的なアプローチを示す
- 不変データ構造と純粋関数によるドメインモデリング手法を示す
- 代数的データ型と型合成による堅牢なドメインモデルの構築方法を説明する
- Zodによる強力なバリデーションと型安全性を実現する

## 2. プロジェクト構造
```
claude_ddd_sample/
├── src/
│   ├── domain/                 # ドメイン層: 型、関数、ドメインロジック
│   │   ├── order/             # 注文ドメイン
│   │   │   ├── types.ts       # 型定義と値オブジェクト生成関数
│   │   │   └── functions.ts   # ドメインロジック
│   │   ├── shipping/          # 配送ドメイン
│   │   │   ├── types.ts       # 型定義と値オブジェクト生成関数
│   │   │   └── functions.ts   # ドメインロジック
│   │   └── events.ts          # ドメインイベント
│   ├── application/           # アプリケーション層: コマンドハンドラー
│   ├── infrastructure/        # インフラストラクチャ層: リポジトリ実装
│   ├── shared/                # 共通ユーティリティと型定義
│   └── example.ts             # 実行可能なサンプルコード
└── tests/                     # ユニットテスト
```

## 3. 型駆動ドメインモデリング

### 3.1 ブランド型による識別子
```typescript
export type OrderId = UUID & { readonly _brand: unique symbol };
export type CustomerId = UUID & { readonly _brand: unique symbol };
```

### 3.2 Zodスキーマによる値オブジェクト
```typescript
export const PriceSchema = z.number()
  .nonnegative("価格は負の値にできません")
  .max(999999.99, "価格は999,999.99を超えることはできません")
  .transform(price => Math.round(price * 100) / 100);
export type Price = z.infer<typeof PriceSchema> & { readonly _brand: unique symbol };
```

### 3.3 代数的データ型による状態表現
```typescript
export const OrderStatusSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draft") }),
  z.object({ type: z.literal("placed"), placedAt: z.date() }),
  z.object({ type: z.literal("paid"), paidAt: z.date() }),
  z.object({ type: z.literal("cancelled"), cancelledAt: z.date(), reason: z.string() })
]);
```

## 4. 純粋関数によるドメインロジック

### 4.1 ファクトリ関数
```typescript
export const createOrder = (customerId: CustomerId): Order => {
  const now = new Date();
  const order = {
    id: createOrderId(),
    customerId,
    lines: [],
    status: { type: "draft" as const },
    totalAmount: 0 as Price,
    createdAt: now,
    updatedAt: now
  };

  const result = OrderSchema.safeParse(order);
  if (!result.success) {
    throw new Error(result.error.errors[0].message);
  }
  return result.data;
};
```

### 4.2 状態遷移関数
```typescript
export const placeOrder = (order: Order): Result<Order> => {
  if (order.status.type !== "draft") {
    return {
      success: false,
      error: "下書き状態の注文のみ確定できます"
    };
  }

  const result = OrderSchema.safeParse({
    ...order,
    status: { type: "placed" as const, placedAt: new Date() },
    updatedAt: new Date()
  });

  if (!result.success) {
    return { success: false, error: result.error.errors[0].message };
  }

  return { success: true, value: result.data };
};
```

## 5. アプリケーション層

### 5.1 コマンドハンドラー
```typescript
export const createPlaceOrderCommandHandler = (
  orderRepository: OrderRepository,
  eventBus: EventBus
) => {
  return (command: PlaceOrderCommand): TaskEither<PlaceOrderError, OrderId> => {
    return pipe(
      taskEither.fromEither(right(createOrder(createCustomerId()))),
      taskEither.chain(/* 注文明細追加 */),
      taskEither.chain(/* 注文確定 */),
      taskEither.chain(/* 永続化 */),
      taskEither.chain(/* イベント発行 */)
    );
  };
};
```

## 6. スマートコンストラクタパターン

### 6.1 値オブジェクトの安全な生成
```typescript
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
```

## 7. イベント駆動アーキテクチャ

### 7.1 ドメインイベント
```typescript
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
    const result = OrderPlacedEventSchema.safeParse(this);
    if (!result.success) {
      throw new Error(result.error.errors[0].message);
    }
    return result.data;
  }
}
```

## 8. TaskEitherによる非同期エラーハンドリング

### 8.1 モナド変換の活用
```typescript
export type TaskEither<E, A> = Task<Either<E, A>>;

// エラーを伝播しながら非同期処理を合成
pipe(
  getOrderTE(orderId),
  taskEither.chain(order => addOrderLineTE(order, line)),
  taskEither.chain(order => saveOrderTE(order)),
  taskEither.map(order => order.id)
);
```

## 9. テスティング

### 9.1 純粋関数のテスト
```typescript
describe('createOrder', () => {
  it('有効な顧客IDで新しい注文を作成できる', () => {
    const customerId = createCustomerId();
    const order = createOrder(customerId);
    
    expect(order.customerId).toBe(customerId);
    expect(order.status.type).toBe("draft");
    expect(order.lines).toEqual([]);
  });
});
```

## 10. 実行方法

### 10.1 サンプルの実行
```bash
npm run example
npm run example:app
```

### 10.2 テストの実行
```bash
npm test
npm run type-check
```

## 11. まとめ
本プロジェクトは、TypeScriptで関数型プログラミングとDDDを組み合わせた実装例を示しています。主な特徴：

- **不変性**: 全てのデータ構造をreadonly
- **純粋関数**: 副作用を持たないドメインロジック
- **型安全性**: ブランド型とZodによる堅牢な型システム
- **エラーハンドリング**: Result/Either型による明示的なエラー処理
- **関数合成**: パイプラインとモナド変換による処理の組み立て

このアプローチにより、保守性が高く、テスト容易で、バグの少ないコードを実現しています。