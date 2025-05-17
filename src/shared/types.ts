import { z } from 'zod';

export const UUIDSchema = z.string().uuid();
export type UUID = z.infer<typeof UUIDSchema>;

// 成功または失敗を表現するEither型
export type Either<E, A> = { type: "left"; value: E } | { type: "right"; value: A };

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