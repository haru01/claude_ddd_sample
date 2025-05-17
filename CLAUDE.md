Claude - TypeScriptによる関数型ドメイン駆動設計アプローチ
1. はじめに
本ドキュメントでは、TypeScriptを使用した関数型プログラミングパラダイムによるドメイン駆動設計（DDD）の実装アプローチについて説明します。オブジェクト指向DDDとは異なり、関数型DDDでは不変性、副作用の分離、型駆動設計を中心に据えています。
1.1 目的
このプロジェクトの目的は以下の通りです：

TypeScriptによる関数型プログラミングとDDDを組み合わせた実践的なアプローチを提示する
不変データ構造と純粋関数によるドメインモデリング手法を示す
代数的データ型と型合成による堅牢なドメインモデルの構築方法を説明する
関数型プログラミングの原則（不変性、副作用の分離、関数合成）を活用したDDD実装を提供する
Zodによる強力なバリデーションでドメインの整合性を保証する

2. プロジェクト構造
関数型DDDアプローチでは、以下のようなプロジェクト構造を採用します：
claude/
├── src/
│   ├── domain/                 # ドメイン層: 型、関数、ドメインロジック
│   │   ├── conversation/       # 会話ドメイン
│   │   ├── knowledge/          # 知識ドメイン
│   │   ├── generation/         # 生成ドメイン
│   │   ├── tools/              # ツールドメイン
│   │   └── safety/             # 安全性ドメイン
│   ├── application/            # アプリケーション層: ユースケース、ワークフロー
│   ├── infrastructure/         # インフラストラクチャ層: 外部システム連携
│   ├── api/                    # API層: HTTPインターフェース
│   └── shared/                 # 共通ユーティリティと基盤コード
└── tests/
    ├── domain/                 # ドメインロジックのテスト
    ├── application/            # アプリケーションのテスト
    └── api/                    # APIエンドポイントのテスト
3. 型駆動ドメインモデリング
関数型DDDでは、まず型を定義することからドメインモデリングを始めます。TypeScriptの型システムとZodを活用して、「不正な状態を表現できない」モデルを構築します。
3.1 会話ドメインの型定義
typescript// src/domain/conversation/types.ts
import { z } from 'zod';
import { UUID } from "../../shared/types";

// 値オブジェクトとしての識別子
export type ConversationId = UUID & { readonly _brand: unique symbol };
export type UserId = UUID & { readonly _brand: unique symbol };
export type MessageId = UUID & { readonly _brand: unique symbol };

// 列挙型による制約
export const MessageRoleSchema = z.enum(["user", "assistant", "system"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

// 値オブジェクト
export const MessageContentSchema = z.string()
  .min(1, "メッセージの内容は空にできません")
  .max(10000, "メッセージの内容は10,000文字を超えることはできません")
  .transform(content => content.trim());
export type MessageContent = z.infer<typeof MessageContentSchema> & { readonly _brand: unique symbol };

// ドメインエンティティ
export const MessageSchema = z.object({
  id: z.custom<MessageId>(),
  role: MessageRoleSchema,
  content: z.custom<MessageContent>(),
  createdAt: z.date()
}).readonly();
export type Message = z.infer<typeof MessageSchema>;

// 会話の状態を表す代数的データ型
export const ConversationStateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("active") }),
  z.object({ type: z.literal("ended"), endedAt: z.date() }),
  z.object({ type: z.literal("archived"), archivedAt: z.date() })
]);
export type ConversationState = z.infer<typeof ConversationStateSchema>;

// 集約ルート
export const ConversationSchema = z.object({
  id: z.custom<ConversationId>(),
  userId: z.custom<UserId>(),
  messages: z.array(MessageSchema).readonly(),
  state: ConversationStateSchema,
  createdAt: z.date(),
  updatedAt: z.date()
}).readonly();
export type Conversation = z.infer<typeof ConversationSchema>;

// 結果型
export const ResultSchema = <T>(schema: z.ZodType<T>) => z.discriminatedUnion("success", [
  z.object({ success: z.literal(true), value: schema }),
  z.object({ success: z.literal(false), error: z.string() })
]);
export type Result<T> = z.infer<ReturnType<typeof ResultSchema<T>>>;
3.2 値オブジェクト生成関数
typescript// src/domain/conversation/valueObjects.ts
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import {
  ConversationId,
  UserId,
  MessageId,
  MessageContent,
  Result,
  MessageContentSchema
} from './types';

// スマートコンストラクタパターン - 不変の値オブジェクトを安全に生成

export const createConversationId = (): ConversationId => {
  return uuidv4() as ConversationId;
};

export const createUserId = (): UserId => {
  return uuidv4() as UserId;
};

export const createMessageId = (): MessageId => {
  return uuidv4() as MessageId;
};

export const createMessageContent = (content: string): Result<MessageContent> => {
  const result = MessageContentSchema.safeParse(content);

  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0].message || "無効なメッセージ内容です"
    };
  }

  return {
    success: true,
    value: result.data as MessageContent
  };
};
4. ドメイン関数
関数型DDDでは、オブジェクト指向のメソッドの代わりに、純粋関数を使ってドメインロジックを実装します。これにより、副作用を分離し、テスト容易性を高めます。
4.1 会話ドメイン関数
typescript// src/domain/conversation/functions.ts
import { z } from 'zod';
import {
  Conversation,
  Message,
  MessageRole,
  MessageContent,
  ConversationId,
  UserId,
  ConversationState,
  Result,
  MessageSchema,
  ConversationSchema
} from './types';
import {
  createConversationId,
  createMessageId,
  createMessageContent
} from './valueObjects';

// ファクトリ関数 - 新しい会話を作成
export const createConversation = (userId: UserId): Conversation => {
  const now = new Date();

  const conversation = {
    id: createConversationId(),
    userId,
    messages: [],
    state: { type: "active" as const },
    createdAt: now,
    updatedAt: now
  };

  // スキーマでバリデーション
  return ConversationSchema.parse(conversation);
};

// メッセージ作成の純粋関数
export const createMessage = (
  role: MessageRole,
  contentStr: string,
  now: Date = new Date()
): Result<Message> => {
  const contentResult = createMessageContent(contentStr);

  if (!contentResult.success) {
    return contentResult;
  }

  try {
    const message = MessageSchema.parse({
      id: createMessageId(),
      role,
      content: contentResult.value,
      createdAt: now
    });

    return {
      success: true,
      value: message
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0].message
      };
    }
    return {
      success: false,
      error: "メッセージの作成中に不明なエラーが発生しました"
    };
  }
};

// 会話にメッセージを追加する純粋関数
export const addMessage = (
  conversation: Conversation,
  message: Message
): Result<Conversation> => {
  // 会話状態のバリデーション
  if (conversation.state.type !== "active") {
    return {
      success: false,
      error: "終了した会話にメッセージを追加することはできません"
    };
  }

  try {
    // 新しい会話オブジェクトを作成し、スキーマでバリデーション
    const updatedConversation = ConversationSchema.parse({
      ...conversation,
      messages: [...conversation.messages, message],
      updatedAt: new Date()
    });

    return {
      success: true,
      value: updatedConversation
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0].message
      };
    }
    return {
      success: false,
      error: "会話の更新中に不明なエラーが発生しました"
    };
  }
};

// 会話を終了する純粋関数
export const endConversation = (
  conversation: Conversation
): Result<Conversation> => {
  if (conversation.state.type !== "active") {
    return {
      success: false,
      error: "すでに終了している会話を終了することはできません"
    };
  }

  const now = new Date();

  try {
    const updatedConversation = ConversationSchema.parse({
      ...conversation,
      state: { type: "ended" as const, endedAt: now },
      updatedAt: now
    });

    return {
      success: true,
      value: updatedConversation
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0].message
      };
    }
    return {
      success: false,
      error: "会話の終了中に不明なエラーが発生しました"
    };
  }
};

// 会話を保存するための関数型インターフェース
export interface ConversationRepository {
  save: (conversation: Conversation) => Promise<void>;
  findById: (id: ConversationId) => Promise<Conversation | null>;
  findByUserId: (userId: UserId) => Promise<Conversation[]>;
}
5. 副作用の分離
関数型DDDでは、純粋なドメインロジックと副作用（データベースアクセス、API呼び出しなど）を明確に分離します。
5.1 Either型とTask型の導入
typescript// src/shared/types.ts
import { z } from 'zod';

export const UUIDSchema = z.string().uuid();
export type UUID = z.infer<typeof UUIDSchema>;

// 成功または失敗を表現するEither型
export const EitherSchema = <E, A>(errorSchema: z.ZodType<E>, valueSchema: z.ZodType<A>) =>
  z.discriminatedUnion("type", [
    z.object({ type: z.literal("left"), value: errorSchema }),
    z.object({ type: z.literal("right"), value: valueSchema })
  ]);

export type Either<E, A> = z.infer<ReturnType<typeof EitherSchema<E, A>>>;

// 非同期処理の結果を表現するTask型
export type Task<A> = Promise<A>;

// 非同期処理が失敗する可能性がある操作を表現するTaskEither型
export type TaskEither<E, A> = Task<Either<E, A>>;

// Either型のヘルパー関数
export const left = <E, A>(e: E): Either<E, A> => ({ type: "left", value: e });
export const right = <E, A>(a: A): Either<E, A> => ({ type: "right", value: a });

// TaskEither型のヘルパー関数
export const taskEither = {
  fromEither: <E, A>(either: Either<E, A>): TaskEither<E, A> =>
    Promise.resolve(either),

  fromPromise: <E, A>(promise: Promise<A>, onReject: (reason: unknown) => E): TaskEither<E, A> =>
    promise
      .then(a => right<E, A>(a))
      .catch(reason => left<E, A>(onReject(reason))),

  // モナディックな操作
  map: <E, A, B>(f: (a: A) => B) =>
    (task: TaskEither<E, A>): TaskEither<E, B> =>
      task.then(either => either.type === "right"
        ? right(f(either.value))
        : either as Either<E, B>),

  chain: <E, A, B>(f: (a: A) => TaskEither<E, B>) =>
    (task: TaskEither<E, A>): TaskEither<E, B> =>
      task.then(either => either.type === "right"
        ? f(either.value)
        : Promise.resolve(either as Either<E, B>))
};
5.2 リポジトリの実装
typescript// src/infrastructure/repositories/conversationRepository.ts
import { z } from 'zod';
import {
  Conversation,
  ConversationId,
  UserId,
  ConversationRepository,
  ConversationSchema
} from '../../domain/conversation/types';
import { Database } from '../database';
import { Either, TaskEither, left, right, taskEither } from '../../shared/types';

// 永続化のためのエラー型
const RepositoryErrorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("not_found"),
    message: z.string()
  }),
  z.object({
    type: z.literal("database_error"),
    message: z.string(),
    cause: z.unknown().optional()
  })
]);
type RepositoryError = z.infer<typeof RepositoryErrorSchema>;

export class PostgresConversationRepository implements ConversationRepository {
  constructor(private readonly db: Database) {}

  async save(conversation: Conversation): Promise<void> {
    try {
      // 保存前にスキーマバリデーション
      ConversationSchema.parse(conversation);

      await this.db.transaction(async (client) => {
        // 会話の基本情報を保存
        await client.query(
          `INSERT INTO conversations(id, user_id, state, created_at, updated_at)
           VALUES($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE
           SET state = $3, updated_at = $5`,
          [
            conversation.id,
            conversation.userId,
            JSON.stringify(conversation.state),
            conversation.createdAt,
            conversation.updatedAt
          ]
        );

        // メッセージを保存
        for (const message of conversation.messages) {
          await client.query(
            `INSERT INTO messages(id, conversation_id, role, content, created_at)
             VALUES($1, $2, $3, $4, $5)
             ON CONFLICT (id) DO NOTHING`,
            [
              message.id,
              conversation.id,
              message.role,
              message.content,
              message.createdAt
            ]
          );
        }
      });
    } catch (error) {
      console.error("会話の保存中にエラーが発生しました", error);
      throw error;
    }
  }

  async findById(id: ConversationId): Promise<Conversation | null> {
    try {
      // 会話の基本情報を取得
      const conversationResult = await this.db.query(
        `SELECT id, user_id, state, created_at, updated_at
         FROM conversations
         WHERE id = $1`,
        [id]
      );

      if (conversationResult.rows.length === 0) {
        return null;
      }

      const conversationRow = conversationResult.rows[0];

      // 関連するメッセージを取得
      const messagesResult = await this.db.query(
        `SELECT id, role, content, created_at
         FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [id]
      );

      // データベースの行からドメインオブジェクトに変換
      const conversation = {
        id: conversationRow.id,
        userId: conversationRow.user_id,
        state: JSON.parse(conversationRow.state),
        messages: messagesResult.rows.map(row => ({
          id: row.id,
          role: row.role,
          content: row.content,
          createdAt: new Date(row.created_at)
        })),
        createdAt: new Date(conversationRow.created_at),
        updatedAt: new Date(conversationRow.updated_at)
      };

      // スキーマでバリデーション
      return ConversationSchema.parse(conversation);
    } catch (error) {
      console.error("会話の検索中にエラーが発生しました", error);
      throw error;
    }
  }

  async findByUserId(userId: UserId): Promise<Conversation[]> {
    // 実装省略
    return [];
  }

  // TaskEitherを使った関数型APIの提供
  findByIdTE(id: ConversationId): TaskEither<RepositoryError, Conversation> {
    return taskEither.fromPromise(
      this.findById(id).then(result => {
        if (result === null) {
          throw new Error(`会話ID ${id} が見つかりません`);
        }
        return result;
      }),
      (error): RepositoryError => {
        const errorObj = error instanceof Error && error.message.includes("見つかりません")
          ? { type: "not_found" as const, message: error.message }
          : { type: "database_error" as const, message: "データベースエラー", cause: error };

        // スキーマバリデーション
        return RepositoryErrorSchema.parse(errorObj);
      }
    );
  }
}
6. アプリケーション層
アプリケーション層では、ドメイン関数を組み合わせてユースケースを実装します。関数型DDDでは、パイプラインやモナド変換を活用して関数を合成します。
6.1 コマンドハンドラー
typescript// src/application/commands/addMessageCommand.ts
import { pipe } from 'fp-ts/function';
import { z } from 'zod';
import { TaskEither, taskEither } from '../../shared/types';
import {
  ConversationId,
  MessageRole,
  Message,
  Conversation,
  MessageRoleSchema
} from '../../domain/conversation/types';
import {
  createMessage,
  addMessage
} from '../../domain/conversation/functions';
import { ConversationRepository } from '../../domain/conversation/types';
import { MessageAddedEvent } from '../../domain/events';
import { EventBus } from '../../infrastructure/events/eventBus';

// コマンド型
export const AddMessageCommandSchema = z.object({
  conversationId: z.custom<ConversationId>(),
  role: MessageRoleSchema,
  content: z.string().min(1).max(10000)
}).readonly();

export type AddMessageCommand = z.infer<typeof AddMessageCommandSchema>;

// エラー型
export const AddMessageErrorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("not_found"), message: z.string() }),
  z.object({ type: z.literal("validation_error"), message: z.string() }),
  z.object({
    type: z.literal("repository_error"),
    message: z.string(),
    cause: z.unknown().optional()
  })
]);

export type AddMessageError = z.infer<typeof AddMessageErrorSchema>;

// コマンドハンドラー
export const createAddMessageCommandHandler = (
  conversationRepository: ConversationRepository,
  eventBus: EventBus
) => {
  return (command: AddMessageCommand): TaskEither<AddMessageError, void> => {
    // バリデーション
    try {
      AddMessageCommandSchema.parse(command);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError: AddMessageError = {
          type: "validation_error",
          message: error.errors[0].message
        };
        return taskEither.fromEither({ type: "left", value: validationError });
      }
    }

    // 1. 会話を取得
    return pipe(
      taskEither.fromPromise(
        conversationRepository.findById(command.conversationId),
        (error): AddMessageError => ({
          type: "repository_error",
          message: "会話の取得中にエラーが発生しました",
          cause: error
        })
      ),

      // 2. 会話が存在しない場合はエラー
      taskEither.chain(conversation => {
        if (conversation === null) {
          return taskEither.fromEither({
            type: "left",
            value: {
              type: "not_found",
              message: `会話ID ${command.conversationId} が見つかりません`
            }
          });
        }
        return taskEither.fromEither({ type: "right", value: conversation });
      }),

      // 3. メッセージを作成
      taskEither.chain(conversation => {
        const messageResult = createMessage(
          command.role,
          command.content
        );

        if (!messageResult.success) {
          return taskEither.fromEither({
            type: "left",
            value: {
              type: "validation_error",
              message: messageResult.error
            }
          });
        }

        return taskEither.fromEither({
          type: "right",
          value: { conversation, message: messageResult.value }
        });
      }),

      // 4. 会話にメッセージを追加
      taskEither.chain(({ conversation, message }) => {
        const updatedConversationResult = addMessage(conversation, message);

        if (!updatedConversationResult.success) {
          return taskEither.fromEither({
            type: "left",
            value: {
              type: "validation_error",
              message: updatedConversationResult.error
            }
          });
        }

        return taskEither.fromEither({
          type: "right",
          value: {
            conversation: updatedConversationResult.value,
            message
          }
        });
      }),

      // 5. 更新した会話を保存
      taskEither.chain(({ conversation, message }) =>
        taskEither.fromPromise(
          conversationRepository.save(conversation)
            .then(() => ({ conversation, message })),
          (error): AddMessageError => ({
            type: "repository_error",
            message: "会話の保存中にエラーが発生しました",
            cause: error
          })
        )
      ),

      // 6. イベントを発行
      taskEither.chain(({ conversation, message }) =>
        taskEither.fromPromise(
          eventBus.publish(new MessageAddedEvent(
            conversation.id,
            message.id,
            message.role
          )),
          (error): AddMessageError => ({
            type: "repository_error",
            message: "イベントの発行中にエラーが発生しました",
            cause: error
          })
        )
      )
    );
  };
};
6.2 クエリハンドラー
typescript// src/application/queries/getConversationHistoryQuery.ts
import { pipe } from 'fp-ts/function';
import { z } from 'zod';
import { TaskEither, taskEither } from '../../shared/types';
import { ConversationId } from '../../domain/conversation/types';

// DTOの定義
export const MessageDtoSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.string(),
  createdAt: z.string()
}).readonly();
export type MessageDto = z.infer<typeof MessageDtoSchema>;

export const ConversationHistoryDtoSchema = z.object({
  conversationId: z.string(),
  messages: z.array(MessageDtoSchema).readonly()
}).readonly();
export type ConversationHistoryDto = z.infer<typeof ConversationHistoryDtoSchema>;

// クエリの定義
export const GetConversationHistoryQuerySchema = z.object({
  conversationId: z.custom<ConversationId>()
}).readonly();
export type GetConversationHistoryQuery = z.infer<typeof GetConversationHistoryQuerySchema>;

// エラー型
export const GetConversationHistoryErrorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("not_found"), message: z.string() }),
  z.object({
    type: z.literal("database_error"),
    message: z.string(),
    cause: z.unknown().optional()
  })
]);
export type GetConversationHistoryError = z.infer<typeof GetConversationHistoryErrorSchema>;

// クエリハンドラーの作成
export const createGetConversationHistoryQueryHandler = (
  dbClient: any  // データベースクライアント
) => {
  return (query: GetConversationHistoryQuery): TaskEither<GetConversationHistoryError, ConversationHistoryDto> => {
    // クエリのバリデーション
    try {
      GetConversationHistoryQuerySchema.parse(query);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return taskEither.fromEither({
          type: "left",
          value: {
            type: "database_error",
            message: error.errors[0].message
          }
        });
      }
    }

    const getMessages = async (): Promise<MessageDto[]> => {
      const result = await dbClient.query(
        `SELECT id, role, content, created_at as "createdAt"
         FROM messages
         WHERE conversation_id = $1
         ORDER BY created_at ASC`,
        [query.conversationId]
      );

      const dtos = result.rows.map((row: any) => ({
        id: row.id,
        role: row.role,
        content: row.content,
        createdAt: row.createdAt.toISOString()
      }));

      // DTOのバリデーション
      return z.array(MessageDtoSchema).parse(dtos);
    };

    // 会話の存在確認
    const checkConversationExists = async (): Promise<boolean> => {
      const result = await dbClient.query(
        `SELECT EXISTS(
           SELECT 1 FROM conversations WHERE id = $1
         ) as "exists"`,
        [query.conversationId]
      );

      return result.rows[0].exists;
    };

    return pipe(
      // 1. 会話の存在を確認
      taskEither.fromPromise(
        checkConversationExists(),
        (error): GetConversationHistoryError => ({
          type: "database_error",
          message: "会話の確認中にエラーが発生しました",
          cause: error
        })
      ),

      // 2. 会話が存在しない場合はエラー
      taskEither.chain(exists => {
        if (!exists) {
          return taskEither.fromEither({
            type: "left",
            value: {
              type: "not_found",
              message: `会話ID ${query.conversationId} が見つかりません`
            }
          });
        }
        return taskEither.fromEither({ type: "right", value: undefined });
      }),

      // 3. メッセージを取得
      taskEither.chain(() =>
        taskEither.fromPromise(
          getMessages(),
          (error): GetConversationHistoryError => ({
            type: "database_error",
            message: "メッセージの取得中にエラーが発生しました",
            cause: error
          })
        )
      ),

      // 4. DTOに変換とバリデーション
      taskEither.chain(messages => {
        try {
          const dto = ConversationHistoryDtoSchema.parse({
            conversationId: query.conversationId,
            messages
          });

          return taskEither.fromEither({ type: "right", value: dto });
        } catch (error) {
          if (error instanceof z.ZodError) {
            return taskEither.fromEither({
              type: "left",
              value: {
                type: "database_error",
                message: `DTOの変換中にエラーが発生しました: ${error.errors[0].message}`
              }
            });
          }
          return taskEither.fromEither({
            type: "left",
            value: {
              type: "database_error",
              message: "不明なエラーが発生しました"
            }
          });
        }
      })
    );
  };
};
7. 生成AIとの統合
関数型DDDアプローチでは、AIモデルとの対話も純粋関数と副作用の分離原則に従って実装します。
typescript// src/domain/generation/types.ts
import { z } from 'zod';
import { TaskEither } from '../../shared/types';
import { ConversationId, Message } from '../conversation/types';

// AI生成エラー
export const GenerationErrorSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("api_error"),
    message: z.string(),
    cause: z.unknown().optional()
  }),
  z.object({ type: z.literal("validation_error"), message: z.string() }),
  z.object({ type: z.literal("context_limit_error"), message: z.string() })
]);
export type GenerationError = z.infer<typeof GenerationErrorSchema>;

// プロンプト生成関数の型
export type PromptGenerator = (messages: ReadonlyArray<Message>) => string;

// AI生成サービスのインターフェース
export interface GenerationService {
  generateResponse: (
    conversationId: ConversationId,
    messages: ReadonlyArray<Message>
  ) => TaskEither<GenerationError, string>;
}

// src/infrastructure/ai/claudeGenerationService.ts
import { z } from 'zod';
import { TaskEither, taskEither } from '../../shared/types';
import {
  ConversationId,
  Message,
  MessageRole
} from '../../domain/conversation/types';
import {
  GenerationService,
  GenerationError,
  PromptGenerator,
  GenerationErrorSchema
} from '../../domain/generation/types';
import axios from 'axios';

// リクエストスキーマの定義
const ApiMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string()
});
export type ApiMessage = z.infer<typeof ApiMessageSchema>;

const ApiRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ApiMessageSchema),
  max_tokens: z.number().positive().int(),
  temperature: z.number().min(0).max(1)
});
export type ApiRequest = z.infer<typeof ApiRequestSchema>;

export class ClaudeGenerationService implements GenerationService {
  constructor(
    private readonly apiKey: string,
    private readonly apiUrl: string,
    private readonly promptGenerator: PromptGenerator
  ) {}

  generateResponse(
    conversationId: ConversationId,
    messages: ReadonlyArray<Message>
  ): TaskEither<GenerationError, string> {
    // メッセージ履歴からClaudeのAPIフォーマットに変換
    const apiMessages = messages.map(msg => ({
      role: msg.role === MessageRole.User ? "user" :
            msg.role === MessageRole.Assistant ? "assistant" : "system",
      content: msg.content
    }));

    try {
      // リクエストのバリデーション
      const request = ApiRequestSchema.parse({
        model: "claude-3-opus-20240229",
        messages: apiMessages,
        max_tokens: 1000,
        temperature: 0.7
      });

      // APIリクエストの実行
      return taskEither.fromPromise(
        axios.post(
          this.apiUrl,
          request,
          {
            headers: {
              "Content-Type": "application/json",
              "x-api-key": this.apiKey
            }
          }
        )
        .then(response => response.data.content[0].text),
        (error): GenerationError => {
          if (axios.isAxiosError(error)) {
            if (error.response?.status === 400 &&
                error.response?.data?.error?.includes("context limit")) {
              return GenerationErrorSchema.parse({
                type: "context_limit_error",
                message: "入力が長すぎます。会話履歴を短くしてください。"
              });
            }

            return GenerationErrorSchema.parse({
              type: "api_error",
              message: `APIエラー: ${error.response?.status} ${error.response?.statusText}`,
              cause: error
            });
          }

          return GenerationErrorSchema.parse({
            type: "api_error",
            message: "不明なエラーが発生しました",
            cause: error
          });
        }
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        return taskEither.fromEither({
          type: "left",
          value: GenerationErrorSchema.parse({
            type: "validation_error",
            message: `リクエストの検証に失敗しました: ${error.errors[0].message}`
          })
        });
      }

      return taskEither.fromEither({
        type: "left",
        value: GenerationErrorSchema.parse({
          type: "api_error",
          message: "リクエスト作成中に不明なエラーが発生しました",
          cause: error
        })
      });
    }
  }
}
8. API実装
Express.jsを使用したAPI層の実装です。関数型プログラミングのアプローチを適用しています。
typescript// src/api/routes/conversationRoutes.ts
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  CreateConversationCommand,
  createCreateConversationCommandHandler
} from '../../application/commands/createConversationCommand';
import {
  AddMessageCommand,
  AddMessageCommandSchema,
  createAddMessageCommandHandler
} from '../../application/commands/addMessageCommand';
import {
  GetConversationHistoryQuery,
  GetConversationHistoryQuerySchema,
  createGetConversationHistoryQueryHandler
} from '../../application/queries/getConversationHistoryQuery';
import { ConversationRepository } from '../../domain/conversation/types';
import { EventBus } from '../../infrastructure/events/eventBus';
import { DbClient } from '../../infrastructure/database';

export const createConversationRoutes = (
  conversationRepository: ConversationRepository,
  eventBus: EventBus,
  dbClient: DbClient
) => {
  const router = Router();

  // コマンドとクエリハンドラーの作成
  const createConversationHandler = createCreateConversationCommandHandler(
    conversationRepository,
    eventBus
  );

  const addMessageHandler = createAddMessageCommandHandler(
    conversationRepository,
    eventBus
  );

  const getConversationHistoryHandler = createGetConversationHistoryQueryHandler(
    dbClient
  );

  // 会話の作成
  router.post('/', async (req: Request, res: Response) => {
    const command: CreateConversationCommand = {
      userId: req.body.userId
    };

    const result = await createConversationHandler(command);

    if (result.type === "left") {
      const error = result.value;
      return res.status(400).json({ error: error.message });
    }

    return res.status(201).json({ id: result.value });
  });

  // メッセージの追加
  router.post('/:id/messages', async (req: Request, res: Response) => {
    try {
      // リクエストバリデーション
      const command = AddMessageCommandSchema.parse({
        conversationId: req.params.id,
        role: req.body.role,
        content: req.body.content
      });

      const result = await addMessageHandler(command);

      if (result.type === "left") {
        const error = result.value;

        if (error.type === "not_found") {
          return res.status(404).json({ error: error.message });
        }

        return res.status(400).json({ error: error.message });
      }

      return res.status(201).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "バリデーションエラー",
          details: error.errors
        });
      }
      return res.status(500).json({ error: "不明なエラーが発生しました" });
    }
  });

  // 会話履歴の取得
  router.get('/:id/history', async (req: Request, res: Response) => {
    try {
      // リクエストバリデーション
      const query = GetConversationHistoryQuerySchema.parse({
        conversationId: req.params.id
      });

      const result = await getConversationHistoryHandler(query);

      if (result.type === "left") {
        const error = result.value;

        if (error.type === "not_found") {
          return res.status(404).json({ error: error.message });
        }

        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json(result.value);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: "バリデーションエラー",
          details: error.errors
        });
      }
      return res.status(500).json({ error: "不明なエラーが発生しました" });
    }
  });

  return router;
};
9. イベント処理
関数型DDDでは、ドメインイベントを使って副作用を分離し、モジュール間の疎結合を実現します。
typescript// src/domain/events.ts
import { z } from 'zod';
import { ConversationId, MessageId, MessageRole, MessageRoleSchema } from './conversation/types';

// イベントの基底インターフェース
export const DomainEventSchema = z.object({
  eventType: z.string(),
  occurredAt: z.date()
}).readonly();
export type DomainEvent = z.infer<typeof DomainEventSchema>;

// メッセージ追加イベント
export const MessageAddedEventSchema = DomainEventSchema.extend({
  eventType: z.literal("message_added"),
  conversationId: z.custom<ConversationId>(),
  messageId: z.custom<MessageId>(),
  messageRole: MessageRoleSchema
}).readonly();
export type MessageAddedEventType = z.infer<typeof MessageAddedEventSchema>;

export class MessageAddedEvent implements MessageAddedEventType {
  readonly eventType = "message_added";
  readonly occurredAt: Date;

  constructor(
    public readonly conversationId: ConversationId,
    public readonly messageId: MessageId,
    public readonly messageRole: MessageRole
  ) {
    this.occurredAt = new Date();
  }

  // スキーマで自己検証するメソッド
  validate(): MessageAddedEventType {
    return MessageAddedEventSchema.parse(this);
  }
}

// 会話終了イベント
export const ConversationEndedEventSchema = DomainEventSchema.extend({
  eventType: z.literal("conversation_ended"),
  conversationId: z.custom<ConversationId>()
}).readonly();
export type ConversationEndedEventType = z.infer<typeof ConversationEndedEventSchema>;

export class ConversationEndedEvent implements ConversationEndedEventType {
  readonly eventType = "conversation_ended";
  readonly occurredAt: Date;

  constructor(
    public readonly conversationId: ConversationId
  ) {
    this.occurredAt = new Date();
  }

  // スキーマで自己検証するメソッド
  validate(): ConversationEndedEventType {
    return ConversationEndedEventSchema.parse(this);
  }
}

// src/infrastructure/events/eventBus.ts
import { z } from 'zod';
import { DomainEvent, DomainEventSchema } from '../../domain/events';

// イベントハンドラーの型
export type EventHandler<T extends DomainEvent> = (event: T) => Promise<void>;

// イベントバスのインターフェース
export interface EventBus {
  publish: <T extends DomainEvent>(event: T) => Promise<void>;
  subscribe: <T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>
  ) => void;
}

// インメモリイベントバスの実装
export class InMemoryEventBus implements EventBus {
  private handlers: Record<string, EventHandler<any>[]> = {};

  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): void {
    if (!this.handlers[eventType]) {
      this.handlers[eventType] = [];
    }

    this.handlers[eventType].push(handler);
  }

  async publish<T extends DomainEvent>(event: T): Promise<void> {
    // イベントの検証
    try {
      DomainEventSchema.parse(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new Error(`無効なイベント: ${error.errors[0].message}`);
      }
      throw error;
    }

    const eventType = event.eventType;
    const handlers = this.handlers[eventType] || [];

    await Promise.all(
      handlers.map(handler => handler(event))
    );
  }
}
10. ユニットテスト
関数型DDDのユニットテストは、純粋関数のテストとして実装できます。これにより、テストが簡潔で理解しやすくなります。
typescript// tests/domain/conversation/functions.test.ts
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  createConversation,
  createMessage,
  addMessage,
  endConversation
} from '../../../src/domain/conversation/functions';
import {
  UserId,
  MessageRole,
  ConversationSchema,
  MessageSchema
} from '../../../src/domain/conversation/types';
import { createUserId } from '../../../src/domain/conversation/valueObjects';

describe('会話ドメイン関数', () => {
  describe('createConversation', () => {
    it('有効なユーザーIDで新しい会話を作成できる', () => {
      // Arrange
      const userId = createUserId();

      // Act
      const conversation = createConversation(userId);

      // Assert
      expect(() => ConversationSchema.parse(conversation)).not.toThrow();
      expect(conversation.id).toBeDefined();
      expect(conversation.userId).toBe(userId);
      expect(conversation.messages).toEqual([]);
      expect(conversation.state).toEqual({ type: "active" });
      expect(conversation.createdAt).toBeInstanceOf(Date);
      expect(conversation.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('createMessage', () => {
    it('有効な内容でユーザーメッセージを作成できる', () => {
      // Arrange
      const content = "こんにちは、Claude";
      const now = new Date();

      // Act
      const result = createMessage(MessageRole.User, content, now);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(() => MessageSchema.parse(result.value)).not.toThrow();
        expect(result.value.id).toBeDefined();
        expect(result.value.role).toBe(MessageRole.User);
        expect(result.value.content).toBe(content);
        expect(result.value.createdAt).toBe(now);
      }
    });

    it('空の内容でメッセージを作成できない', () => {
      // Arrange
      const content = "";

      // Act
      const result = createMessage(MessageRole.User, content);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("メッセージの内容は空にできません");
      }
    });
  });

  describe('addMessage', () => {
    it('アクティブな会話にメッセージを追加できる', () => {
      // Arrange
      const userId = createUserId();
      const conversation = createConversation(userId);
      const messageResult = createMessage(MessageRole.User, "こんにちは");

      if (!messageResult.success) {
        throw new Error("メッセージの作成に失敗しました");
      }

      // Act
      const result = addMessage(conversation, messageResult.value);

      // Assert
      expect(result.success).toBe(true);
      if (result.success) {
        expect(() => ConversationSchema.parse(result.value)).not.toThrow();
        expect(result.value.messages.length).toBe(1);
        expect(result.value.messages[0]).toBe(messageResult.value);
        expect(result.value.updatedAt.getTime()).toBeGreaterThanOrEqual(conversation.updatedAt.getTime());
      }
    });

    it('終了した会話にメッセージを追加できない', () => {
      // Arrange
      const userId = createUserId();
      let conversation = createConversation(userId);
      const endResult = endConversation(conversation);

      if (!endResult.success) {
        throw new Error("会話の終了に失敗しました");
      }

      conversation = endResult.value;

      const messageResult = createMessage(MessageRole.User, "こんにちは");

      if (!messageResult.success) {
        throw new Error("メッセージの作成に失敗しました");
      }

      // Act
      const result = addMessage(conversation, messageResult.value);

      // Assert
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("終了した会話にメッセージを追加することはできません");
      }
    });
  });
});
11. 結論
本ドキュメントでは、TypeScriptを使用した関数型ドメイン駆動設計（DDD）アプローチについて説明しました。関数型DDDでは、以下の特徴を持つ実装が可能です：

不変性と型安全性 - 不変のデータ構造と強力な型システムにより、ドメインモデルの整合性を保証
厳格なバリデーション - Zodによるスキーマベースのバリデーションで、ドメインルールを型レベルで強制
副作用の分離 - 純粋な関数とTaskEitherモナドを使用して副作用を明示的に分離
関数合成 - パイプラインやモナド変換を使った関数の合成により、複雑なロジックを整理
代数的データ型 - より表現力のある型システムを活用して、「不正な状態を表現できない」モデルを構築
テスト容易性 - 副作用を分離することで、純粋関数のテストが容易になる

このアプローチを採用することで、複雑なドメインロジックを持つシステムでも、保守性と拡張性の高いコードを実現できます。Zodによるスキーマ駆動開発により、型の安全性と実行時のバリデーションを両立させ、より堅牢なシステムを構築できます。
12. 参考文献

"Domain Modeling Made Functional" by Scott Wlaschin
"Functional Programming in TypeScript" by Giulio Canti
"Functional and Reactive Domain Modeling" by Debasish Ghosh
"Implementing Domain-Driven Design" by Vaughn Vernon
"Clean Architecture" by Robert C. Martin
"TypeScript in 50 Lessons" by Stefan Baumgartner
"Type-Driven Development with TypeScript" by Josh Adams, et al.
"Zod Documentation" (https://zod.dev/)