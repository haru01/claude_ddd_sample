# 関数型DDDサンプル

このプロジェクトは、TypeScriptを使用した関数型プログラミングパラダイムによるドメイン駆動設計（DDD）の学習用リポジトリです。

注意： CLAUDE.mdも適当に生成しただけです。

## 特徴

- **型駆動設計**: Zodスキーマによる厳格な型定義とバリデーション
- **不変性**: 全てのドメインモデルは不変データ構造として実装
- **純粋関数**: ドメインロジックは副作用のない純粋関数として実装
- **副作用の分離**: Either/TaskEitherモナドを使用した副作用の明示的な管理
- **代数的データ型**: 注文と配送の状態を適切に表現

## プロジェクト構造

```
src/
├── domain/                 # ドメイン層
│   ├── order/             # 注文ドメイン
│   │   ├── types.ts       # 型定義と値オブジェクト生成関数
│   │   └── functions.ts   # ドメインロジック
│   ├── shipping/          # 配送ドメイン
│   │   ├── types.ts       # 型定義と値オブジェクト生成関数
│   │   └── functions.ts   # ドメインロジック
│   └── events.ts          # ドメインイベント
├── application/           # アプリケーション層
│   ├── placeOrderCommand.ts
│   └── createShippingCommand.ts
├── infrastructure/        # インフラストラクチャ層
│   └── repositories/      # リポジトリ実装
│       ├── inMemoryOrderRepository.ts
│       └── inMemoryShippingRepository.ts
├── shared/                # 共通ユーティリティ
│   └── types.ts          # Either/TaskEither型
└── example.ts            # 実行例
```

## セットアップ

```bash
# 依存関係のインストール
npm install

# TypeScriptの型チェック
npm run type-check

# テストの実行
npm test

# サンプルの実行
npm run example
npm run example:app
```

## 主要な概念

### 1. 型定義と値オブジェクト（統合されたtypes.ts）

```typescript
// ブランド型を使用した型安全な識別子
export type OrderId = UUID & { readonly _brand: unique symbol };

// Zodスキーマによるバリデーション付き値オブジェクト
export const PriceSchema = z.number()
  .nonnegative("価格は負の値にできません")
  .max(999999.99, "価格は999,999.99を超えることはできません");

// スマートコンストラクタパターン
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

### 2. 集約

```typescript
// 不変の集約ルート
export const OrderSchema = z.object({
  id: z.custom<OrderId>(),
  customerId: z.custom<CustomerId>(),
  lines: z.array(OrderLineSchema).readonly(),
  status: OrderStatusSchema,
  totalAmount: z.custom<Price>(),
  createdAt: z.date(),
  updatedAt: z.date()
}).readonly();
```

### 3. ドメイン関数

```typescript
// 純粋関数としてのドメインロジック
export const addOrderLine = (
  order: Order,
  line: OrderLine
): Result<Order> => {
  // ビジネスルールのバリデーション
  if (order.status.type !== "draft") {
    return {
      success: false,
      error: "下書き状態の注文のみに明細を追加できます"
    };
  }
  // 新しい状態を返す
  return { success: true, value: newOrder };
};
```

### 4. 副作用の分離

```typescript
// TaskEitherモナドによる副作用の管理
export const createPlaceOrderCommandHandler = (
  orderRepository: OrderRepository,
  eventBus: EventBus
) => {
  return (command: PlaceOrderCommand): TaskEither<PlaceOrderError, OrderId> => {
    return pipe(
      // 純粋な関数の組み合わせ
      taskEither.fromEither(createOrder(customerId)),
      taskEither.chain(addOrderLines),
      taskEither.chain(placeOrder),
      // 副作用（永続化）
      taskEither.chain(saveToRepository),
      // 副作用（イベント発行）
      taskEither.chain(publishEvent)
    );
  };
};
```

## ドメインモデル

### 注文（Order）

- **状態**: draft → placed → paid → cancelled
- **ビジネスルール**:
  - 下書き状態でのみ商品を追加可能
  - 商品がない注文は確定不可
  - 支払い済みの注文のみ配送可能

### 配送（Shipping）

- **状態**: pending → preparing → shipped → delivered/failed
- **ビジネスルール**:
  - 支払い済みの注文のみ配送作成可能
  - 各状態遷移は順次的
  - 配送方法により配達予定日が決定

## テスト

```bash
# 全てのテストを実行
npm test

# 特定のテストを実行
npm test -- tests/domain/order

# ウォッチモードでテスト
npm test -- --watch
```

## TODO

Claudeに解析してもらった課題。関数型DDDにおける純粋性と不変性を確保するために：

1. クラスの代わりに純粋関数を使用
  - データとロジックを分離
  - ファクトリ関数でオブジェクトを生成
2. 例外の代わりにResult/Either型を使用
  - エラーを値として扱う
  - 型シグネチャで失敗の可能性を明示
3. 不変データ構造の使用
  - Immutable.jsなどのライブラリを活用
  - 状態変更は新しいオブジェクトを返す
4. 副作用の分離
  - 日付や乱数などは外部から注入
  - IOモナドなどで副作用を管理


## 参考資料

- [Zod](https://zod.dev/) - TypeScript-firstスキーマバリデーション
- [fp-ts](https://gcanti.github.io/fp-ts/) - TypeScript向け関数型プログラミングライブラリ
- Domain Modeling Made Functional - Scott Wlaschin
- Functional and Reactive Domain Modeling - Debasish Ghosh