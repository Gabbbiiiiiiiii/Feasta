import {randomUUID} from "node:crypto";
import {
  assertTransferEvidence, externalAttemptIdentity, type TransferEvidence,
} from "./provider-disbursement-domain.js";
import {DisbursementSubmissionError} from "./provider-disbursement-errors.js";
import {parsePayMongoWalletResource} from "./paymongo-wallet-client.js";

type Data = Record<string, unknown>;
export const TEST_DESTINATION_NUMBERS = new Set([
  "999999990001", "999999990002", "999999990003",
  "999999990004", "999999990005", "999999990006",
]);
export const SOURCE_WALLET_BIC = "PAEYPHM2XXX";
export const TEST_WALLET_ID = /^wallet_[A-Za-z0-9_-]{3,200}$/u;
const TRANSFER_ID = /^tr_[A-Za-z0-9_-]{1,200}$/u;
const BIC = /^[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/u;
const invalid = () => new Error("PayMongo test disbursement authority invalid.");
export function record(value: unknown): Data {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  return value as Data;
}
const nonempty = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 200;

export function testDestination(value: unknown) {
  const d = record(value);
  if (typeof d.number !== "string" || !TEST_DESTINATION_NUMBERS.has(d.number) ||
      (d.livemode !== undefined && d.livemode !== false) ||
      !nonempty(d.name) || typeof d.bic !== "string" || !BIC.test(d.bic) ||
      (d.provider !== "instapay" && d.provider !== "pesonet")) throw invalid();
  return {number: d.number, name: d.name, bic: d.bic, provider: d.provider};
}
export function validateTestAttempt(attempt: Data, dispatch = false) {
  const snapshot = record(attempt.destinationSnapshot);
  const identity = externalAttemptIdentity(String(attempt.providerDisbursementId),
    Number(attempt.attemptSequence));
  if (attempt.schemaVersion !== 1 || attempt.livemode !== false ||
      attempt.currency !== "PHP" || !Number.isSafeInteger(attempt.amountInCentavos) ||
      Number(attempt.amountInCentavos) <= 0 || attempt.transportMode !== "wallet_transfer" ||
      snapshot.testMode !== true || snapshot.livemode !== false ||
      (dispatch && (typeof snapshot.allowedDisbursementId !== "string" ||
        snapshot.allowedDisbursementId !== attempt.providerDisbursementId ||
        !Number.isSafeInteger(snapshot.verificationExpiresAtMs) ||
        Number(snapshot.verificationExpiresAtMs) <= Date.now() ||
        typeof snapshot.sourceMerchantId !== "string" || !/^org_[A-Za-z0-9_-]{3,200}$/u.test(snapshot.sourceMerchantId))) ||
      typeof snapshot.walletId !== "string" || !TEST_WALLET_ID.test(snapshot.walletId) ||
      Object.entries(identity).some(([key, value]) => attempt[key] !== value) ||
      (dispatch ? attempt.status !== "reserved" || attempt.gatewayResourceId != null :
        !["reserved", "processing", "ambiguous"].includes(String(attempt.status))) ||
      (attempt.gatewayResourceId != null &&
        (typeof attempt.gatewayResourceId !== "string" ||
          !TRANSFER_ID.test(attempt.gatewayResourceId)))) {
    throw invalid();
  }
  const destination = testDestination({
    ...record(snapshot.destinationAccount), provider: snapshot.provider,
  });
  return {walletId: snapshot.walletId, destination};
}

/** Whitelist evidence only; never persist raw gateway payloads. */
export function normalizePayMongoTransfer(value: unknown): TransferEvidence {
  const resource = record(value);
  const a = resource.attributes === undefined ? resource : record(resource.attributes);
  const walletTransaction = resource.type === "wallet_transaction";
  if (resource.type !== undefined &&
      !["transfer", "wallet_transaction"].includes(String(resource.type))) {
    throw invalid();
  }
  const receiver = walletTransaction ? record(a.receiver) : record(a.destination_account);
  const id = walletTransaction ? a.transfer_id ?? resource.id : resource.id;
  const destination = walletTransaction ? {
    number: receiver.bank_account_number, name: receiver.bank_account_name, bic: receiver.bank_code,
  } : receiver;
  if (typeof id !== "string" || !TRANSFER_ID.test(id) || a.livemode !== false ||
      (resource.livemode !== undefined && resource.livemode !== false) ||
      !Number.isSafeInteger(a.amount) || Number(a.amount) <= 0 || a.currency !== "PHP" ||
      !["pending", "succeeded", "failed"].includes(String(a.status)) ||
      typeof a.reference_number !== "string" || !/^pd_[a-f0-9]{40}$/u.test(a.reference_number) ||
      !nonempty(destination.number) || !nonempty(destination.name) || !nonempty(destination.bic)) {
    throw invalid();
  }
  const evidence: TransferEvidence = {
    id, reference_number: a.reference_number, amount: Number(a.amount), currency: "PHP",
    livemode: false, status: a.status as TransferEvidence["status"],
    destination_account: {number: destination.number, name: destination.name, bic: destination.bic},
  };
  for (const key of ["provider_reference_number", "batch_transfer_id"] as const) {
    const value = a[key];
    if (value != null) {
      if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,220}$/u.test(value)) throw invalid();
      evidence[key] = value;
    }
  }
  return evidence;
}

/** V2 wallet.account is authoritative; source_account is the guide's equivalent shape. */
export function testWalletSource(value: unknown, walletId: string) {
  const resource = record(record(value).data);
  const a = resource.attributes === undefined ? resource : record(resource.attributes);
  if (resource.id !== walletId || a.livemode !== false || a.status !== "activated" ||
      (resource.livemode !== undefined && resource.livemode !== false)) throw invalid();
  let source: Data;
  if (a.source_account !== undefined) {
    source = record(a.source_account);
  } else {
    const account = record(a.account);
    if (account.currency !== "PHP" ||
        (account.provider !== undefined && account.provider !== "paymongo")) throw invalid();
    source = {number: account.account_number, name: account.account_name, bic: SOURCE_WALLET_BIC};
  }
  if (typeof source.number !== "string" || !/^[0-9]{1,34}$/u.test(source.number) ||
      !nonempty(source.name) || source.bic !== SOURCE_WALLET_BIC) throw invalid();
  return {number: source.number, name: source.name, bic: SOURCE_WALLET_BIC};
}

/** Documented V2 balance.available is PHP centavos, not the legacy available_balance. */
function assertTestWalletFunding(value: unknown, amountInCentavos: number) {
  const resource = record(record(value).data);
  const a = resource.attributes === undefined ? resource : record(resource.attributes);
  const balance = a.balance;
  if (!balance || typeof balance !== "object" || Array.isArray(balance)) {
    throw new DisbursementSubmissionError("not_submitted", "wallet_balance_invalid");
  }
  const available = (balance as Data).available;
  if (!Number.isSafeInteger(available) || Number(available) < 0) {
    throw new DisbursementSubmissionError("not_submitted", "wallet_balance_invalid");
  }
  if (Number(available) < amountInCentavos) {
    throw new DisbursementSubmissionError("not_submitted", "wallet_balance_insufficient");
  }
}

export type TestClientOptions = {
  secretKey: () => string;
  authorizeSubmission?: (attempt: Data, dispatchToken: string) => Promise<void>;
  http?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
};
/** Three exchanges, 10s each, backoff 1s/2s. Errors contain no secrets or gateway bodies. */
export function createPayMongoDisbursementClient(options: TestClientOptions) {
  const http = options.http ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  async function request(
    path: string, method = "GET", body?: string, key?: string, beforeWrite?: () => Promise<void>,
  ): Promise<unknown> {
    const secret = options.secretKey();
    if (typeof secret !== "string" || !/^sk_test_[A-Za-z0-9_-]+$/u.test(secret)) {
      throw new DisbursementSubmissionError("not_submitted", "secret_invalid");
    }
    for (let exchange = 0; exchange < 3; exchange++) {
      let response: Response | undefined;
      let payload: unknown;
      // Fail closed outside the catch that retries HTTP failures.
      if (method === "POST") await beforeWrite?.();
      try {
        // Mark uncertainty BEFORE handing a POST to the HTTP implementation.
        response = await http("https://api.paymongo.com" + path, {
          method, body, redirect: "error", signal: AbortSignal.timeout(10_000),
          headers: {Accept: "application/json", "Content-Type": "application/json",
            Authorization: "Basic " + Buffer.from(secret + ":").toString("base64"),
            ...(key ? {"Idempotency-Key": key} : {})},
        });
        payload = await response.json();
      } catch {
        // A write may exist. Retry only the identical body/key within this bounded call.
        if (response && response.status >= 400 && response.status < 500) {
          throw new Error("PayMongo test request rejected without trusted evidence.");
        }
        if (exchange === 2) throw new Error("PayMongo test request outcome unknown.");
        await sleep(1000 * 2 ** exchange);
        continue;
      }
      if (response.ok) return payload;
      const errors = payload && typeof payload === "object" ? (payload as Data).errors : undefined;
      const inProgress = response.status === 409 && Array.isArray(errors) &&
        errors.some(e => e && typeof e === "object" && e.code === "idempotency_in_progress");
      if (!(response.status >= 500 || inProgress)) {
        throw new Error("PayMongo test request rejected without trusted evidence.");
      }
      if (exchange < 2) await sleep(1000 * 2 ** exchange);
    }
    throw new Error("PayMongo test request outcome unknown.");
  }
  return {
    /** Read-only verification also validates source name/number required for a later transfer. */
    async verifyWallet(walletId: string) {
      if (!TEST_WALLET_ID.test(walletId)) throw invalid();
      const value = await request("/v2/wallets/" + walletId + "?fields=account&fields=balance");
      testWalletSource(value, walletId);
      return parsePayMongoWalletResource(value);
    },
    async dispatch(attempt: Data): Promise<TransferEvidence> {
      let submissionPossible = false;
      const dispatchToken = randomUUID();
      let phase: "authority_invalid" | "wallet_verification_failed" = "authority_invalid";
      try {
      const {walletId, destination} = validateTestAttempt(attempt, true);
      phase = "wallet_verification_failed";
      const wallet = await request("/v2/wallets/" + walletId + "?fields=account&fields=balance");
      const resource = record(record(wallet).data);
      const walletAttributes = resource.attributes === undefined ? resource : record(resource.attributes);
      if (walletAttributes.merchant_id !== record(attempt.destinationSnapshot).sourceMerchantId) throw invalid();
      const source = testWalletSource(wallet, walletId);
      assertTestWalletFunding(wallet, Number(attempt.amountInCentavos));
      const {provider, ...destinationAccount} = destination;
      const body = JSON.stringify({transfers: [{
        provider, amount: attempt.amountInCentavos, currency: "PHP", purpose: "Disbursement",
        description: "FEASTA TEST Provider disbursement", reference_number: attempt.referenceNumber,
        source_account: source, destination_account: destinationAccount,
        metadata: {feasta_external_attempt_id: attempt.externalAttemptId,
          feasta_disbursement_id: attempt.providerDisbursementId, feasta_test_mode: true},
      }]});
      // GET retries can outlast the proof; recheck immediately before any POST.
      validateTestAttempt(attempt, true);
      const batch = record(record(await request("/v2/batch_transfers", "POST", body,
        String(attempt.idempotencyKey), async () => {
          validateTestAttempt(attempt, true);
          const authorize = options.authorizeSubmission ??
            (await import("./provider-disbursement-execution.js")).authorizeProviderDisbursementSubmission;
          await authorize(attempt, dispatchToken);
          submissionPossible = true;
        })).data);
      const attributes = batch.attributes === undefined ? batch : record(batch.attributes);
      if (typeof batch.id !== "string" ||
          !/^(?:btr_|batch_tr_)[A-Za-z0-9_-]{1,200}$/u.test(batch.id) ||
          !Array.isArray(attributes.transfers) || attributes.transfers.length !== 1 ||
          (batch.livemode !== undefined && batch.livemode !== false) ||
          (attributes.livemode !== undefined && attributes.livemode !== false)) throw invalid();
      const evidence = normalizePayMongoTransfer(attributes.transfers[0]);
      if (evidence.batch_transfer_id && evidence.batch_transfer_id !== batch.id) throw invalid();
      evidence.batch_transfer_id = batch.id;
      assertTransferEvidence(attempt, evidence);
      return evidence;
      } catch (error) {
        if (submissionPossible) throw new DisbursementSubmissionError("unknown", "submission_unconfirmed");
        if (error instanceof DisbursementSubmissionError) throw error;
        throw new DisbursementSubmissionError("not_submitted", phase);
      }
    },
    async retrieve(attempt: Data): Promise<TransferEvidence | null> {
      validateTestAttempt(attempt);
      if (attempt.gatewayResourceId != null) {
        const evidence = normalizePayMongoTransfer(record(await request(
          "/v2/transfers/" + attempt.gatewayResourceId)).data);
        assertTransferEvidence(attempt, evidence);
        return evidence;
      }
      // Official Get List Transfer documents limit/before_id, NOT reference_number.
      // Traverse older pages and establish uniqueness only after exhaustion.
      const seen = new Set<string>();
      let cursor: string | undefined;
      let match: TransferEvidence | undefined;
      const limit = 100;
      for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
        const query = new URLSearchParams({limit: String(limit)});
        if (cursor) query.set("before_id", cursor);
        const result = record(await request("/v2/transfers?" + query.toString()));
        const page = Array.isArray(result.data) ? result : record(result.data);
        const rows = Array.isArray(result.data) ? result.data : page.transfers;
        if (!Array.isArray(rows) || rows.length > limit) throw invalid();
        const flags = [result.has_more, page.has_more,
          result.meta === undefined ? undefined : record(result.meta).has_more];
        if (flags.some(flag => flag !== undefined && typeof flag !== "boolean") ||
            (flags.includes(true) && flags.includes(false))) throw invalid();
        for (const value of rows) {
          const row = record(value);
          const a = row.attributes === undefined ? row : record(row.attributes);
          if (typeof row.id !== "string" || !TRANSFER_ID.test(row.id) || seen.has(row.id) ||
              typeof a.reference_number !== "string") throw invalid();
          seen.add(row.id);
          if (a.reference_number === attempt.referenceNumber) {
            if (match) throw new Error("PayMongo test reference lookup is conflicting.");
            match = normalizePayMongoTransfer(row);
            assertTransferEvidence(attempt, match);
          }
        }
        const more = flags.includes(true) || (!flags.includes(false) && rows.length === limit);
        if (!more) return match ?? null;
        if (!rows.length) throw invalid();
        cursor = String(record(rows[rows.length - 1]).id);
      }
      throw new Error("PayMongo test reference lookup exceeded its safe page bound.");
    },
  };
}

export function retrievePayMongoTestSettlementWallet(input: {secretKey: string; walletId: string}) {
  return createPayMongoDisbursementClient({secretKey: () => input.secretKey}).verifyWallet(input.walletId);
}
