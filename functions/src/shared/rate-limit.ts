import {createHash} from "node:crypto";

import {Timestamp} from "firebase-admin/firestore";
import type {CallableRequest} from "firebase-functions/v2/https";
import {HttpsError} from "firebase-functions/v2/https";

import {db} from "./firestore.js";
import {serverTimestamp} from "./timestamps.js";
import {
  correlationIdFromCallable,
  logSecurityEvent,
} from "./security-events.js";

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowSeconds: number;
}

export async function enforceCallableRateLimit(
  request: CallableRequest<unknown>,
  policy: RateLimitPolicy,
): Promise<void> {
  const uid = request.auth?.uid;
  const appId = request.app?.appId;
  const forwardedFor = request.rawRequest.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwardedFor) ?
    forwardedFor[0] : forwardedFor?.split(",")[0]?.trim();
  const ip = forwardedIp || request.rawRequest.ip || "unknown";

  const subject = uid ? `user:${uid}` :
    appId ? `app:${appId}:ip:${ip}` : `ip:${ip}`;
  await enforceRateLimit({
    ...policy,
    subject,
    actorUid: uid,
    correlationId: correlationIdFromCallable(request),
  });
}

export async function enforceRateLimit(
  input: RateLimitPolicy & {
    subject: string;
    actorUid?: string;
    correlationId?: string;
  },
): Promise<void> {
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new Error("Rate-limit count must be a positive integer.");
  }
  if (!Number.isInteger(input.windowSeconds) || input.windowSeconds < 1) {
    throw new Error("Rate-limit window must be a positive integer.");
  }

  const now = Timestamp.now();
  const bucketNumber = Math.floor(
    now.toMillis() / (input.windowSeconds * 1000),
  );
  const windowEndsAt = Timestamp.fromMillis(
    (bucketNumber + 1) * input.windowSeconds * 1000,
  );
  const documentId = createHash("sha256")
    .update(`${input.scope}\u0000${input.subject}\u0000${bucketNumber}`)
    .digest("hex");
  const reference = db.collection("rateLimits").doc(documentId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const count = typeof snapshot.data()?.count === "number" ?
      snapshot.data()?.count as number : 0;

    if (count >= input.limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowEndsAt.toMillis() - now.toMillis()) / 1000),
      );
      logSecurityEvent({
        action: "rate_limit_rejected",
        outcome: "denied",
        actorUid: input.actorUid,
        targetId: input.scope,
        correlationId: input.correlationId,
        reasonCode: "quota_exceeded",
        metadata: {
          retryAfterSeconds,
          limit: input.limit,
          windowSeconds: input.windowSeconds,
        },
      });
      throw new HttpsError(
        "resource-exhausted",
        `Too many requests. Retry in ${retryAfterSeconds} seconds.`,
        {
          retryAfterSeconds,
          limit: input.limit,
          windowSeconds: input.windowSeconds,
        },
      );
    }

    transaction.set(reference, {
      scope: input.scope,
      subjectHash: createHash("sha256").update(input.subject).digest("hex"),
      count: count + 1,
      limit: input.limit,
      windowSeconds: input.windowSeconds,
      windowStartedAt: Timestamp.fromMillis(
        bucketNumber * input.windowSeconds * 1000,
      ),
      windowEndsAt,
      expiresAt: Timestamp.fromMillis(
        windowEndsAt.toMillis() + 24 * 60 * 60 * 1000,
      ),
      createdAt: snapshot.data()?.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, {merge: true});
  });
}
