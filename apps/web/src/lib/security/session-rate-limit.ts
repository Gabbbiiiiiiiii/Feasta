import "server-only";

import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";

import {adminDb} from "@/lib/firebase/admin";

const WINDOW_SECONDS = 5 * 60;
const ATTEMPT_LIMIT = 10;
const ADMIN_WINDOW_SECONDS = 15 * 60;
const ADMIN_IP_ATTEMPT_LIMIT = 20;
const ADMIN_ACCOUNT_ATTEMPT_LIMIT = 8;

export const WEB_AUTHENTICATION_ATTEMPT_ACTIONS = [
  "customer_registration",
  "provider_registration",
  "provider_phone_registration",
  "provider_phone_classification",
  "password_reset",
  "email_verification_resend",
  "email_update",
  "password_change",
  "logout_all",
] as const;

export type WebAuthenticationAttemptAction =
  (typeof WEB_AUTHENTICATION_ATTEMPT_ACTIONS)[number];

const authenticationAttemptPolicies: Record<
  WebAuthenticationAttemptAction,
  {windowSeconds: number; ipLimit: number; subjectLimit: number}
> = {
  customer_registration: {
    windowSeconds: 60 * 60,
    ipLimit: 10,
    subjectLimit: 5,
  },
  provider_registration: {
    windowSeconds: 60 * 60,
    ipLimit: 6,
    subjectLimit: 3,
  },
  provider_phone_registration: {
    windowSeconds: 15 * 60,
    ipLimit: 5,
    subjectLimit: 3,
  },
  provider_phone_classification: {
    windowSeconds: 15 * 60,
    ipLimit: 10,
    subjectLimit: 6,
  },
  password_reset: {
    windowSeconds: 60 * 60,
    ipLimit: 10,
    subjectLimit: 5,
  },
  email_verification_resend: {
    windowSeconds: 15 * 60,
    ipLimit: 10,
    subjectLimit: 5,
  },
  email_update: {
    windowSeconds: 60 * 60,
    ipLimit: 10,
    subjectLimit: 5,
  },
  password_change: {
    windowSeconds: 60 * 60,
    ipLimit: 10,
    subjectLimit: 5,
  },
  logout_all: {
    windowSeconds: 24 * 60 * 60,
    ipLimit: 10,
    subjectLimit: 5,
  },
};

export class SessionRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("Too many sign-in attempts.");
    this.name = "SessionRateLimitError";
  }
}

export async function enforceSessionCreationRateLimit(
  request: Request,
  now = Date.now(),
): Promise<void> {
  const identity = requestIdentity(request);
  const windowMilliseconds = WINDOW_SECONDS * 1000;
  const windowStart = Math.floor(now / windowMilliseconds) * windowMilliseconds;
  const digest = createHash("sha256")
    .update(`${identity}:${windowStart}`)
    .digest("hex");
  const reference = adminDb.collection("rateLimits").doc(`web-session-${digest}`);

  await adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const count = typeof snapshot.data()?.count === "number"
      ? snapshot.data()!.count as number
      : 0;
    if (count >= ATTEMPT_LIMIT) {
      const elapsedSeconds = Math.floor((now - windowStart) / 1000);
      throw new SessionRateLimitError(
        Math.max(1, WINDOW_SECONDS - elapsedSeconds),
      );
    }
    transaction.set(reference, {
      scope: "web.session.create",
      count: count + 1,
      windowStartedAt: Timestamp.fromMillis(windowStart),
      expiresAt: Timestamp.fromMillis(windowStart + windowMilliseconds * 2),
      updatedAt: Timestamp.fromMillis(now),
    });
  });
}

export async function enforceWebAuthenticationActionRateLimit(
  request: Request,
  action: WebAuthenticationAttemptAction,
  subject: string,
  now = Date.now(),
): Promise<void> {
  const policy = authenticationAttemptPolicies[action];
  const pepper = rateLimitPepper();
  const windowMilliseconds = policy.windowSeconds * 1000;
  const windowStart = Math.floor(now / windowMilliseconds) * windowMilliseconds;
  const ipDigest = digestIdentity(
    `web-auth:${action}:ip:${requestIdentity(request)}:${windowStart}`,
    pepper,
  );
  const subjectDigest = digestIdentity(
    `web-auth:${action}:subject:${subject}:${windowStart}`,
    pepper,
  );
  const collection = adminDb.collection("rateLimits");
  const ipReference = collection.doc(`web-auth-ip-${ipDigest}`);
  const subjectReference = collection.doc(`web-auth-subject-${subjectDigest}`);

  await adminDb.runTransaction(async (transaction) => {
    const [ipSnapshot, subjectSnapshot] = await Promise.all([
      transaction.get(ipReference),
      transaction.get(subjectReference),
    ]);
    const ipCount = numericCount(ipSnapshot.data()?.count);
    const subjectCount = numericCount(subjectSnapshot.data()?.count);
    const elapsedSeconds = Math.floor((now - windowStart) / 1000);
    const retryAfterSeconds = Math.max(
      1,
      policy.windowSeconds - elapsedSeconds,
    );
    if (
      ipCount >= policy.ipLimit ||
      subjectCount >= policy.subjectLimit
    ) {
      throw new SessionRateLimitError(retryAfterSeconds);
    }
    const timestamps = {
      windowStartedAt: Timestamp.fromMillis(windowStart),
      expiresAt: Timestamp.fromMillis(windowStart + windowMilliseconds * 2),
      updatedAt: Timestamp.fromMillis(now),
    };
    transaction.set(ipReference, {
      scope: `web.auth.${action}.ip`,
      count: ipCount + 1,
      limit: policy.ipLimit,
      ...timestamps,
    });
    transaction.set(subjectReference, {
      scope: `web.auth.${action}.subject`,
      count: subjectCount + 1,
      limit: policy.subjectLimit,
      ...timestamps,
    });
  });
}

export async function enforceAdminLoginAttemptRateLimit(
  request: Request,
  email: string,
  now = Date.now(),
): Promise<void> {
  const normalizedEmail = normalizeLoginIdentifier(email);
  const pepper = rateLimitPepper();
  const windowMilliseconds = ADMIN_WINDOW_SECONDS * 1000;
  const windowStart = Math.floor(now / windowMilliseconds) * windowMilliseconds;
  const ipDigest = digestIdentity(
    `admin-ip:${requestIdentity(request)}:${windowStart}`,
    pepper,
  );
  const accountDigest = digestIdentity(
    `admin-account:${normalizedEmail}:${windowStart}`,
    pepper,
  );
  const collection = adminDb.collection("rateLimits");
  const ipReference = collection.doc(`admin-login-ip-${ipDigest}`);
  const accountReference = collection.doc(
    `admin-login-account-${accountDigest}`,
  );

  await adminDb.runTransaction(async (transaction) => {
    const ipSnapshot = await transaction.get(ipReference);
    const accountSnapshot = await transaction.get(accountReference);
    const ipCount = numericCount(ipSnapshot.data()?.count);
    const accountCount = numericCount(accountSnapshot.data()?.count);
    const elapsedSeconds = Math.floor((now - windowStart) / 1000);
    const retryAfterSeconds = Math.max(
      1,
      ADMIN_WINDOW_SECONDS - elapsedSeconds,
    );
    if (
      ipCount >= ADMIN_IP_ATTEMPT_LIMIT ||
      accountCount >= ADMIN_ACCOUNT_ATTEMPT_LIMIT
    ) {
      throw new SessionRateLimitError(retryAfterSeconds);
    }
    const timestamps = {
      windowStartedAt: Timestamp.fromMillis(windowStart),
      expiresAt: Timestamp.fromMillis(windowStart + windowMilliseconds * 2),
      updatedAt: Timestamp.fromMillis(now),
    };
    transaction.set(ipReference, {
      scope: "web.admin.login.ip",
      count: ipCount + 1,
      ...timestamps,
    });
    transaction.set(accountReference, {
      scope: "web.admin.login.account",
      count: accountCount + 1,
      ...timestamps,
    });
  });
}

export async function recordAdminLoginSuccess(
  request: Request,
  email: string,
  now = Date.now(),
): Promise<void> {
  const normalizedEmail = normalizeLoginIdentifier(email);
  const pepper = rateLimitPepper();
  const windowMilliseconds = ADMIN_WINDOW_SECONDS * 1000;
  const windowStart = Math.floor(now / windowMilliseconds) * windowMilliseconds;
  const accountDigest = digestIdentity(
    `admin-account:${normalizedEmail}:${windowStart}`,
    pepper,
  );
  await adminDb.collection("rateLimits")
    .doc(`admin-login-account-${accountDigest}`)
    .delete()
    .catch(() => undefined);
}

export function normalizeLoginIdentifier(value: string): string {
  return value.trim().toLowerCase().slice(0, 320);
}

function digestIdentity(value: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:${value}`).digest("hex");
}

function numericCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function rateLimitPepper(): string {
  const configured = process.env.WEB_RATE_LIMIT_PEPPER?.trim();
  if (configured) return configured;
  if (
    process.env.USE_FIREBASE_EMULATORS === "true" ||
    process.env.NODE_ENV !== "production"
  ) {
    return "feasta-local-emulator-rate-limit";
  }
  throw new Error("WEB_RATE_LIMIT_PEPPER is required in production.");
}

function requestIdentity(request: Request): string {
  const platformAddress = request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (platformAddress) return platformAddress.slice(0, 128);
  return `unknown:${(request.headers.get("user-agent") ?? "unknown").slice(0, 160)}`;
}
