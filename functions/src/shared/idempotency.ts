import {createHash} from "node:crypto";

import {Timestamp} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {db} from "./firestore.js";
import {serverTimestamp} from "./timestamps.js";

export interface IdempotencyRecord {
  key: string;
  operation: string;
  actorId: string;
  result?: Record<string, unknown>;
}

export type IdempotencyStart =
  | {state: "acquired"; key: string}
  | {
    state: "completed";
    key: string;
    result: Record<string, unknown>;
  };

export function createIdempotencyKey(input: {
  operation: string;
  actorId: string;
  clientKey?: unknown;
  payload?: unknown;
}): string {
  const clientKey = typeof input.clientKey === "string" ?
    input.clientKey.trim().slice(0, 200) : "";
  const material = clientKey.length > 0 ?
    clientKey : stableSerialize(input.payload ?? {});
  return createHash("sha256")
    .update(`${input.operation}\u0000${input.actorId}\u0000${material}`)
    .digest("hex");
}

export async function beginIdempotentOperation(
  input: {
    key: string;
    operation: string;
    actorId: string;
    leaseSeconds?: number;
    retentionSeconds?: number;
  },
): Promise<IdempotencyStart> {
  const reference = db.collection("idempotencyKeys").doc(input.key);
  const now = Timestamp.now();
  const leaseSeconds = input.leaseSeconds ?? 60;
  const retentionSeconds = input.retentionSeconds ?? 24 * 60 * 60;

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const data = snapshot.data();
    const expiresAt = data?.expiresAt instanceof Timestamp ?
      data.expiresAt : null;
    const isRetained = expiresAt !== null && expiresAt.toMillis() > now.toMillis();

    if (snapshot.exists && isRetained) {
      if (data?.operation !== input.operation || data?.actorId !== input.actorId) {
        throw new HttpsError(
          "permission-denied",
          "The idempotency key belongs to another operation.",
        );
      }

      if (data?.status === "completed") {
        return {
          state: "completed" as const,
          key: input.key,
          result: isRecord(data.result) ? data.result : {},
        };
      }

      const leaseExpiresAt = data?.leaseExpiresAt instanceof Timestamp ?
        data.leaseExpiresAt : null;
      if (
        data?.status === "processing" &&
        leaseExpiresAt !== null &&
        leaseExpiresAt.toMillis() > now.toMillis()
      ) {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil((leaseExpiresAt.toMillis() - now.toMillis()) / 1000),
        );
        throw new HttpsError(
          "aborted",
          `This operation is already processing. Retry in ${retryAfterSeconds} seconds.`,
          {retryAfterSeconds},
        );
      }
    }

    transaction.set(reference, {
      key: input.key,
      operation: input.operation,
      actorId: input.actorId,
      status: "processing",
      attemptCount: (typeof data?.attemptCount === "number" ?
        data.attemptCount : 0) + 1,
      leaseExpiresAt: Timestamp.fromMillis(
        now.toMillis() + leaseSeconds * 1000,
      ),
      expiresAt: Timestamp.fromMillis(
        now.toMillis() + retentionSeconds * 1000,
      ),
      errorCode: null,
      errorMessage: null,
      createdAt: data?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, {merge: true});

    return {state: "acquired" as const, key: input.key};
  });
}

export async function completeIdempotentOperation(
  input: IdempotencyRecord,
): Promise<void> {
  const reference = db.collection("idempotencyKeys").doc(input.key);
  await reference.update({
    status: "completed",
    result: input.result ?? {},
    leaseExpiresAt: null,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function failIdempotentOperation(
  input: {
    key: string;
    errorCode: string;
    errorMessage: string;
  },
): Promise<void> {
  const reference = db.collection("idempotencyKeys").doc(input.key);
  await reference.update({
    status: "failed",
    errorCode: input.errorCode,
    errorMessage: input.errorMessage.slice(0, 500),
    leaseExpiresAt: null,
    failedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function executeIdempotently<
  T extends Record<string, unknown>,
>(input: {
  key: string;
  operation: string;
  actorId: string;
  handler: () => Promise<T>;
}): Promise<{result: T; replayed: boolean}> {
  const started = await beginIdempotentOperation(input);
  if (started.state === "completed") {
    return {result: started.result as T, replayed: true};
  }

  try {
    const result = await input.handler();
    await completeIdempotentOperation({...input, result});
    return {result, replayed: false};
  } catch (error) {
    await failIdempotentOperation({
      key: input.key,
      errorCode: error instanceof HttpsError ? error.code : "internal",
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    }).catch(() => undefined);
    throw error;
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
