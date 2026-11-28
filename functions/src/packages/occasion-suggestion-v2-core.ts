import {createHash, createHmac, timingSafeEqual} from "node:crypto";
import {HttpsError} from "firebase-functions/v2/https";
import {exact} from "./v2-validation.js";

export function fail(reason: string, code: ConstructorParameters<typeof HttpsError>[0] =
  "failed-precondition"): never {
  throw new HttpsError(code, reason, {reason});
}
export function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
export function parseSuggestionPage(value: unknown, admin: boolean) {
  const v = exact(value, admin ? ["status"] : [],
    admin ? ["cursor", "pageSize"] : ["status", "cursor", "pageSize"], "INVALID_NAME");
  if ((v.status !== undefined && !["pending", "approved", "rejected", "mapped"].includes(
    v.status as string)) || (admin && v.status !== "pending") ||
    (v.pageSize !== undefined && (!Number.isSafeInteger(v.pageSize) ||
      Number(v.pageSize) < 1 || Number(v.pageSize) > 20)) ||
    (v.cursor !== undefined && (typeof v.cursor !== "string" || v.cursor.length > 4096))) {
    fail("INVALID_CURSOR", "invalid-argument");
  }
  return {status: v.status as string | undefined, pageSize: Number(v.pageSize ?? 20),
    cursor: v.cursor as string | undefined};
}
export interface SuggestionPosition {seconds: number; nanoseconds: number; id: string}
export function signSuggestionCursor(scope: string, position: SuggestionPosition, key: Buffer) {
  const body = Buffer.from(JSON.stringify({scope, position})).toString("base64url");
  return body + "." + createHmac("sha256", key).update(body).digest("base64url");
}
export function readSuggestionCursor(scope: string, token: string | undefined, key: Buffer):
  SuggestionPosition | null {
  if (token === undefined) return null;
  try {
    const [body, signature, extra] = token.split(".");
    const expected = createHmac("sha256", key).update(body).digest();
    const supplied = Buffer.from(signature, "base64url");
    if (extra !== undefined || supplied.length !== expected.length ||
      supplied.toString("base64url") !== signature || !timingSafeEqual(supplied, expected)) {
      throw new Error();
    }
    const v = JSON.parse(Buffer.from(body, "base64url").toString());
    const p = v.position;
    if (v.scope !== scope || !p || !Number.isSafeInteger(p.seconds) ||
      p.seconds < 0 || !Number.isInteger(p.nanoseconds) || p.nanoseconds < 0 ||
      p.nanoseconds >= 1e9 || typeof p.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/u.test(p.id)) throw new Error();
    return p;
  } catch { return fail("INVALID_CURSOR", "invalid-argument"); }
}
export function suggestionWritePolicy(raw: FirebaseFirestore.DocumentData | undefined) {
  const environment = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (raw?.featureGates?.occasionSuggestionWrites !== true) fail("FEATURE_DISABLED");
  if (!environment || raw.effectiveEnvironment !== environment ||
    !Number.isSafeInteger(raw.revision) || raw.revision < 1 ||
    !Number.isSafeInteger(raw.maxPendingSuggestionsPerProvider) ||
    raw.maxPendingSuggestionsPerProvider < 1 ||
    !Number.isSafeInteger(raw.maxNewSuggestionsPerProvider24h) ||
    raw.maxNewSuggestionsPerProvider24h < 1) fail("CONFIG_UNAVAILABLE");
  return {pending: Math.min(3, raw.maxPendingSuggestionsPerProvider),
    daily: Math.min(5, raw.maxNewSuggestionsPerProvider24h)};
}
