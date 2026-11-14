import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall, type CallableRequest} from "firebase-functions/v2/https";
import type {Firestore, QuerySnapshot, Transaction} from "firebase-admin/firestore";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {BookingCandidateError} from "./customer-booking-candidate-pagination.js";
import {customerBookingSearchDto, decodeSearchCursor, encodeSearchCursor, parseBookingSearch,
  type SearchInput} from "./customer-booking-search-contract.js";
import {readCustomerBookingSearch} from "./customer-booking-search-reader.js";

export const CUSTOMER_BOOKING_SEARCH_SETTINGS = "customerBookingSearch";
const signingSecret = defineSecret("CUSTOMER_BOOKING_SEARCH_CURSOR_KEY");
export const SEARCH_LIMITS = {timeoutMs: 25000, sourceBytes: 4 * 1024 * 1024,
  responseBytes: 256 * 1024, queries: 31, documents: 961} as const;

type SearchFirestore = Pick<Firestore, "collection" | "runTransaction">;
export type BookingSearchDependencies = {
  firestore: SearchFirestore;
  authorize: (request: CallableRequest) => Promise<string>;
  rateLimit: (request: CallableRequest) => Promise<void>;
  readiness: () => Promise<unknown>;
  key: () => string;
  now: () => number;
  timeoutMs: number;
};

/** No client verification fields are accepted. Reading history uses the existing
 * active customer policy (requireRole), like web requireCustomer/disclosures.
 * Email/phone verification is a submission policy, not a history-read gate. */
const dependencies: BookingSearchDependencies = {
  firestore: db,
  authorize: async request => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, ["customer"]);
    return actor.uid;
  },
  rateLimit: request => enforceCallableRateLimit(request,
    {scope: "bookings.customerSearch", limit: 30, windowSeconds: 60}),
  readiness: async () => (await db.collection("appSettings")
    .doc(CUSTOMER_BOOKING_SEARCH_SETTINGS).get()).data(),
  key: () => signingSecret.value(),
  now: Date.now,
  timeoutMs: SEARCH_LIMITS.timeoutMs,
};

export function requireBookingSearchReadiness(value: unknown,
  input: SearchInput, now: number): void {
  const data = value as Record<string, unknown> | null;
  // Complete draft coverage requires both sections, even when this call requests history.
  const needsCompanion = input.search.mode === "none" &&
    (input.status === "all" || input.status === "draft");
  if (!data || data.version !== 1 || data.enabled !== true || data.indexesReady !== true ||
    data.historicalInventoryReady !== true || data.relationshipsReady !== true ||
    data.canonicalStatusesAndDatesReady !== true ||
    typeof data.reviewExpiresAtMs !== "number" || !Number.isSafeInteger(data.reviewExpiresAtMs) ||
    data.reviewExpiresAtMs <= now ||
    (needsCompanion && data.companionContractApproved !== true) ||
    (input.search.mode === "code_prefix" && (data.codeStrategy !== "canonical_uppercase_v1" ||
      data.historicalCodeCoverageReady !== true || data.canonicalCodeWritersReady !== true))) {
    throw new HttpsError("failed-precondition", "Booking search is not ready for activation.");
  }
}

/** Guard the unchanged Step 166-B adapter too. Check before/after every RPC, so
 * a timed-out in-flight RPC cannot schedule subsequent relationship reads. */
function boundedFirestore(firestore: SearchFirestore, check: () => void): SearchFirestore {
  let queries = 0;
  let documents = 0;
  let bytes = 0;
  let entered = false;
  const runTransaction: Firestore["runTransaction"] = (callback, options) => {
    if (options?.readOnly !== true) throw new Error("Read-only booking search required.");
    return firestore.runTransaction(transaction => {
      if (entered) throw new Error("Booking search callback replay refused.");
      entered = true;
      const guarded = new Proxy(transaction, {get(target, property) {
        if (property !== "get") {
          throw new Error("Unsupported booking search transaction operation.");
        }
        return async (...args: Parameters<Transaction["get"]>) => {
          check();
          if (++queries > SEARCH_LIMITS.queries) throw exhausted();
          const snapshot = await target.get(...args);
          check();
          const docs = "docs" in snapshot ?
            (snapshot as unknown as QuerySnapshot).docs : [snapshot];
          documents += docs.length;
          for (const doc of docs) bytes += Buffer.byteLength(JSON.stringify(doc.data() ?? null));
          if (documents > SEARCH_LIMITS.documents || bytes > SEARCH_LIMITS.sourceBytes) {
            throw exhausted();
          }
          return snapshot;
        };
      }});
      return callback(guarded);
    }, options);
  };
  return {collection: firestore.collection.bind(firestore), runTransaction};
}
function exhausted() {
  return new HttpsError("resource-exhausted", "Booking search budget exceeded.");
}
function safeError(error: unknown): HttpsError {
  if (error instanceof HttpsError) return error;
  if (error instanceof BookingCandidateError) return new HttpsError(error.code,
    error.code === "invalid-argument" ? "Invalid booking search cursor." :
      "Booking search requires reconciliation.");
  const code = (error as {code?: unknown} | null)?.code;
  if (code === 4 || code === "deadline-exceeded") {
    return new HttpsError("deadline-exceeded", "Booking search timed out.");
  }
  if (code === 9 || code === "failed-precondition") {
    return new HttpsError("failed-precondition", "Booking search backend is not ready.");
  }
  return new HttpsError("unavailable", "Booking search is temporarily unavailable.");
}

/** Exported for local dependency-injected mocks; the callable always uses server dependencies. */
export async function handleCustomerBookingSearch(request: CallableRequest,
  deps: BookingSearchDependencies = dependencies) {
  let expired = false;
  const deadline = deps.now() + deps.timeoutMs;
  const check = () => {
    if (expired || deps.now() >= deadline) {
      throw new HttpsError("deadline-exceeded", "Booking search timed out.");
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    // onCall verifies tokens; this also prevents accidental direct-handler bypass.
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication is required.");
    if (!request.app) throw new HttpsError("unauthenticated", "App Check is required.");
    const uid = await deps.authorize(request);
    check();
    await deps.rateLimit(request);
    check();
    const input = parseBookingSearch(request.data);
    requireBookingSearchReadiness(await deps.readiness(), input, deps.now());
    check();
    const secret = deps.key();
    if (!/^[0-9a-fA-F]{64,128}$/u.test(secret) || secret.length % 2 !== 0) {
      throw new HttpsError("failed-precondition", "Booking search signing key is unavailable.");
    }
    const key = Buffer.from(secret, "hex");
    const after = decodeSearchCursor(uid, input, key);
    const page = await readCustomerBookingSearch({uid, request: input, after,
      firestore: boundedFirestore(deps.firestore, check)});
    check();
    const response = {bookings: page.bookings.map(customerBookingSearchDto),
      nextCursor: page.nextPosition ? encodeSearchCursor(uid, input, page.nextPosition, key) : null,
      hasMore: page.hasMore};
    if (Buffer.byteLength(JSON.stringify(response)) > SEARCH_LIMITS.responseBytes) {
      throw exhausted();
    }
    check();
    return response;
  };
  try {
    return await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        reject(new HttpsError("deadline-exceeded", "Booking search timed out."));
      }, deps.timeoutMs);
    })]);
  } catch (error) {
    // Do not log raw backend errors, source documents, tokens, IDs, or query values.
    throw safeError(error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const searchCustomerBookings = onCall({...appCheckCallableOptions,
  enforceAppCheck: true, timeoutSeconds: 30, memory: "256MiB", secrets: [signingSecret]},
request => handleCustomerBookingSearch(request));
