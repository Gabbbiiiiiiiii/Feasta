import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import type {
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from "firebase-admin/firestore";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {db} from "../shared/firestore.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireRecentAuthentication} from "../shared/recent-auth.js";
import {serverTimestamp} from "../shared/timestamps.js";

import {
  COMPANY_FLOAT_DOC_PATH,
  COMPANY_FLOAT_LEDGER_SCHEMA_VERSION,
  companyAdvancePayoutIdForAdvance,
  companyAdvanceRequestIdForProviderRequest,
  companyFloatCommissionLedgerId,
  companyProviderAdvanceIdForRequest,
  parseCompanyFloat,
  computeProviderAdvanceAmounts,
  planCompanyAdvanceApproval,
  planCompanyAdvanceRepayment,
  planCompanyAdvanceRequest,
  planCompanyFloatCommissionCredit,
  planCompanyFloatFunding,
  providerRequestHasCustomerPayment,
} from "./company-float-domain.js";

const FUND_CONFIRMATION_PHRASE = "FUND";
const ADVANCE_CONFIRMATION_PHRASE = "ADVANCE";

const COMPANY_ADVANCE_DESTINATION = {
  type: "bank" as const,
  accountName: "Provider company advance",
  bankName: "FEASTA Company Float",
  accountNumber: "888888888888",
};

export type FundCompanyFloatResult = {
  availableBalanceInCentavos: number;
  outstandingAdvanceInCentavos: number;
  currency: "PHP";
  mode: "mock";
};

export type RequestCompanyAdvanceResult = {
  advanceRequestId: string;
  providerRequestId: string;
  status: "pending";
};

export type ApproveCompanyAdvanceRequestResult = {
  advanceId: string;
  advanceRequestId: string;
  providerRequestId: string;
  providerId: string;
  amountInCentavos: number;
  currency: "PHP";
  status: "outstanding";
  mode: "mock";
  repaymentDestination: "company_float";
};

export type RejectCompanyAdvanceRequestResult = {
  advanceRequestId: string;
  status: "rejected";
};

export const fundCompanyFloat = onCall(
  appCheckCallableOptions,
  async (request): Promise<FundCompanyFloatResult> => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.admin]);
    requireRecentAuthentication(request.auth?.token.auth_time);

    await enforceCallableRateLimit(request, {
      scope: "providerFinance.fundCompanyFloat",
      limit: 30,
      windowSeconds: 60 * 60,
    });

    const input = requireObject(request.data, "Provide the funding amount and FUND confirmation.");
    const keys = Object.keys(input).sort();
    if (
      keys.length !== 2 ||
      keys[0] !== "amountInCentavos" ||
      keys[1] !== "confirmationPhrase"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Provide the funding amount and FUND confirmation.",
      );
    }

    if (input.confirmationPhrase !== FUND_CONFIRMATION_PHRASE) {
      throw new HttpsError(
        "invalid-argument",
        "Type FUND exactly to confirm company float funding.",
      );
    }

    const amountInCentavos = input.amountInCentavos;
    if (!Number.isSafeInteger(amountInCentavos) || (amountInCentavos as number) <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "Company float funding amount is invalid.",
      );
    }

    const floatRef = floatReference();
    const result = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(floatRef);
      const current = parseCompanyFloat(
        snapshot.exists ? snapshot.data() ?? {} : null,
      );
      let next;
      try {
        next = planCompanyFloatFunding({
          float: current,
          amountInCentavos: amountInCentavos as number,
        });
      } catch (error) {
        throw toFailedPrecondition(error, "Company float could not be funded.");
      }

      const timestamp = serverTimestamp();
      const payload = {
        ...next,
        updatedAt: timestamp,
        lastFundedAt: timestamp,
        lastFundedByAdminUid: actor.uid,
      };
      if (snapshot.exists) {
        transaction.update(floatRef, payload);
      } else {
        transaction.create(floatRef, {...payload, createdAt: timestamp});
      }
      return next;
    });

    return {
      availableBalanceInCentavos: result.availableBalanceInCentavos,
      outstandingAdvanceInCentavos: result.outstandingAdvanceInCentavos,
      currency: "PHP",
      mode: "mock",
    };
  },
);

export const requestCompanyAdvance = onCall(
  appCheckCallableOptions,
  async (request): Promise<RequestCompanyAdvanceResult> => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.provider]);

    await enforceCallableRateLimit(request, {
      scope: "providerFinance.requestCompanyAdvance",
      limit: 20,
      windowSeconds: 60 * 60,
    });

    const input = requireObject(request.data, "Provide the booking request identity.");
    const keys = Object.keys(input).sort();
    if (
      keys.length < 1 ||
      keys.length > 2 ||
      keys[0] !== "providerRequestId" ||
      (keys.length === 2 && keys[1] !== "providerNote")
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Provide the booking request identity.",
      );
    }

    const providerRequestId = input.providerRequestId;
    if (
      typeof providerRequestId !== "string" ||
      !/^[A-Za-z0-9_-]{1,220}$/u.test(providerRequestId)
    ) {
      throw new HttpsError("invalid-argument", "The booking reference is invalid.");
    }

    const providerNote =
      typeof input.providerNote === "string" ? input.providerNote : null;

    const requestRef = db
      .collection("providerRequests")
      .doc(providerRequestId);
    const advanceRequestId = companyAdvanceRequestIdForProviderRequest(
      providerRequestId,
    );
    const advanceRequestRef = db
      .collection("companyAdvanceRequests")
      .doc(advanceRequestId);
    const advanceId = companyProviderAdvanceIdForRequest(advanceRequestId);
    const advanceRef = db.collection("companyProviderAdvances").doc(advanceId);

    const result = await db.runTransaction(async (transaction) => {
      const [requestSnap, advanceRequestSnap, advanceSnap] = await Promise.all([
        transaction.get(requestRef),
        transaction.get(advanceRequestRef),
        transaction.get(advanceRef),
      ]);

      if (!requestSnap.exists) {
        throw new HttpsError("not-found", "The booking was not found.");
      }

      const booking = requestSnap.data() ?? {};
      const providerId = String(booking.providerId ?? "");
      const providerSnap = await transaction.get(
        db.collection("providers").doc(providerId),
      );
      if (!providerSnap.exists) {
        throw new HttpsError("failed-precondition", "Provider profile is unavailable.");
      }
      const provider = providerSnap.data() ?? {};
      if (provider.ownerId !== actor.uid) {
        throw new HttpsError(
          "permission-denied",
          "Only the booking provider can request immediate funding.",
        );
      }

      if (
        ["cancelled", "expired", "rejected"].includes(String(booking.status))
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Immediate funding is not available for this booking state.",
        );
      }

      let planned;
      try {
        planned = planCompanyAdvanceRequest({
          providerRequestId,
          providerId,
          mainEventId: String(booking.mainEventId ?? ""),
          customerId: String(booking.customerId ?? ""),
          requestedByUid: actor.uid,
          providerNote,
          settlementStatus:
            typeof booking.settlementStatus === "string"
              ? booking.settlementStatus
              : null,
          existingRequestStatus:
            advanceRequestSnap.exists
              ? String(advanceRequestSnap.data()?.status ?? null)
              : null,
          existingAdvanceStatus:
            advanceSnap.exists
              ? String(advanceSnap.data()?.status ?? null)
              : null,
        });
      } catch (error) {
        throw toFailedPrecondition(error, "Immediate funding could not be requested.");
      }

      let amounts;
      try {
        amounts = computeProviderAdvanceAmounts(booking);
      } catch (error) {
        throw toFailedPrecondition(error, "Provider net advance amount is unavailable.");
      }

      if (advanceRequestSnap.exists) {
        const existing = advanceRequestSnap.data() ?? {};
        if (existing.status === "rejected" || existing.status === "cancelled") {
          const timestamp = serverTimestamp();
          transaction.update(advanceRequestRef, {
            ...planned,
            status: "pending",
            ...amounts,
            updatedAt: timestamp,
            requestedAt: timestamp,
            rejectedAt: null,
            rejectedByAdminUid: null,
            approvedAt: null,
            approvedByAdminUid: null,
            advanceId: null,
            approvedAmountInCentavos: null,
          });
          transaction.update(requestRef, {
            companyAdvanceRequestId: planned.advanceRequestId,
            companyAdvanceRequestStatus: "pending",
            updatedAt: timestamp,
          });
          return planned;
        }
        throw new HttpsError(
          "failed-precondition",
          "An immediate funding request already exists for this booking.",
        );
      }

      const timestamp = serverTimestamp();
      transaction.create(advanceRequestRef, {
        ...planned,
        ...amounts,
        createdAt: timestamp,
        updatedAt: timestamp,
        requestedAt: timestamp,
        rejectedAt: null,
        rejectedByAdminUid: null,
        approvedAt: null,
        approvedByAdminUid: null,
        advanceId: null,
        approvedAmountInCentavos: null,
      });
      transaction.update(requestRef, {
        companyAdvanceRequestId: planned.advanceRequestId,
        companyAdvanceRequestStatus: "pending",
        updatedAt: timestamp,
      });
      return planned;
    });

    return {
      advanceRequestId: result.advanceRequestId,
      providerRequestId: result.providerRequestId,
      status: "pending",
    };
  },
);

export const rejectCompanyAdvanceRequest = onCall(
  appCheckCallableOptions,
  async (request): Promise<RejectCompanyAdvanceRequestResult> => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.admin]);
    requireRecentAuthentication(request.auth?.token.auth_time);

    await enforceCallableRateLimit(request, {
      scope: "providerFinance.rejectCompanyAdvanceRequest",
      limit: 60,
      windowSeconds: 60 * 60,
    });

    const input = requireObject(request.data, "Provide the advance request identity.");
    const advanceRequestId = requireId(
      input.advanceRequestId,
      "Advance request",
    );

    const ref = db.collection("companyAdvanceRequests").doc(advanceRequestId);
    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists) {
        throw new HttpsError("not-found", "The advance request was not found.");
      }
      const data = snap.data() ?? {};
      if (data.status !== "pending") {
        throw new HttpsError(
          "failed-precondition",
          "Only pending advance requests can be rejected.",
        );
      }
      const timestamp = serverTimestamp();
      transaction.update(ref, {
        status: "rejected",
        rejectedAt: timestamp,
        rejectedByAdminUid: actor.uid,
        updatedAt: timestamp,
      });
      const providerRequestId = String(data.providerRequestId ?? "");
      if (/^[A-Za-z0-9_-]{1,220}$/u.test(providerRequestId)) {
        transaction.update(
          db.collection("providerRequests").doc(providerRequestId),
          {
            companyAdvanceRequestStatus: "rejected",
            updatedAt: timestamp,
          },
        );
      }
    });

    return {advanceRequestId, status: "rejected"};
  },
);

export const approveCompanyAdvanceRequest = onCall(
  appCheckCallableOptions,
  async (request): Promise<ApproveCompanyAdvanceRequestResult> => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.admin]);
    requireRecentAuthentication(request.auth?.token.auth_time);

    await enforceCallableRateLimit(request, {
      scope: "providerFinance.approveCompanyAdvanceRequest",
      limit: 30,
      windowSeconds: 60 * 60,
    });

    const input = requireObject(
      request.data,
      "Provide the advance request identity and ADVANCE confirmation.",
    );
    const keys = Object.keys(input).sort();
    if (
      keys.length !== 2 ||
      keys[0] !== "advanceRequestId" ||
      keys[1] !== "confirmationPhrase"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Provide the advance request identity and ADVANCE confirmation.",
      );
    }

    if (input.confirmationPhrase !== ADVANCE_CONFIRMATION_PHRASE) {
      throw new HttpsError(
        "invalid-argument",
        "Type ADVANCE exactly to confirm this company advance.",
      );
    }

    const advanceRequestId = requireId(input.advanceRequestId, "Advance request");

    const advanceRequestRef = db
      .collection("companyAdvanceRequests")
      .doc(advanceRequestId);
    const floatRef = floatReference();
    const advanceId = companyProviderAdvanceIdForRequest(advanceRequestId);
    const advanceRef = db.collection("companyProviderAdvances").doc(advanceId);
    const advancePayoutId = companyAdvancePayoutIdForAdvance(advanceId);
    const advancePayoutRef = db
      .collection("companyAdvancePayouts")
      .doc(advancePayoutId);

    const approved = await db.runTransaction(async (transaction) => {
      const [requestSnap, floatSnap, advanceSnap, payoutSnap] = await Promise.all([
        transaction.get(advanceRequestRef),
        transaction.get(floatRef),
        transaction.get(advanceRef),
        transaction.get(advancePayoutRef),
      ]);

      if (!requestSnap.exists) {
        throw new HttpsError("not-found", "The advance request was not found.");
      }
      if (advanceSnap.exists || payoutSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "This advance request was already approved.",
        );
      }

      const advanceRequest = requestSnap.data() ?? {};
      const providerRequestId = String(advanceRequest.providerRequestId ?? "");
      const bookingSnap = await transaction.get(
        db.collection("providerRequests").doc(providerRequestId),
      );
      if (!bookingSnap.exists) {
        throw new HttpsError("failed-precondition", "The booking was not found.");
      }
      const booking = bookingSnap.data() ?? {};
      if (!providerRequestHasCustomerPayment(booking.settlementStatus)) {
        throw new HttpsError(
          "failed-precondition",
          "The customer payment is no longer settled for this booking.",
        );
      }

      let amounts;
      try {
        amounts = computeProviderAdvanceAmounts(booking);
      } catch (error) {
        throw toFailedPrecondition(error, "Provider net advance amount is unavailable.");
      }

      const float = parseCompanyFloat(
        floatSnap.exists ? floatSnap.data() ?? {} : null,
      );
      if (!floatSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Fund the company float before approving an advance.",
        );
      }

      let planned;
      try {
        planned = planCompanyAdvanceApproval({
          float,
          amountInCentavos: amounts.providerNetAmountInCentavos,
          maxAmountInCentavos: amounts.providerNetAmountInCentavos,
          advanceRequestId,
          providerRequestId,
          providerId: String(advanceRequest.providerId),
          mainEventId:
            typeof advanceRequest.mainEventId === "string"
              ? advanceRequest.mainEventId
              : null,
          issuedByAdminUid: actor.uid,
          requestStatus: String(advanceRequest.status),
        });
      } catch (error) {
        throw toFailedPrecondition(error, "Company advance could not be approved.");
      }

      const timestamp = serverTimestamp();
      transaction.update(floatRef, {
        ...planned.float,
        updatedAt: timestamp,
        lastAdvanceAt: timestamp,
        lastAdvanceId: planned.advance.advanceId,
      });
      transaction.create(advanceRef, {
        ...planned.advance,
        grossAmountInCentavos: amounts.grossAmountInCentavos,
        commissionAmountInCentavos: amounts.commissionAmountInCentavos,
        createdAt: timestamp,
        updatedAt: timestamp,
        issuedAt: timestamp,
        repaidAt: null,
        advancePayoutId: planned.advancePayoutId,
      });
      transaction.create(advancePayoutRef, {
        schemaVersion: 1,
        advancePayoutId: planned.advancePayoutId,
        advanceId: planned.advance.advanceId,
        advanceRequestId,
        providerRequestId,
        providerId: planned.advance.providerId,
        amountInCentavos: planned.advance.amountInCentavos,
        grossAmountInCentavos: amounts.grossAmountInCentavos,
        commissionAmountInCentavos: amounts.commissionAmountInCentavos,
        currency: "PHP",
        status: "succeeded",
        mode: "mock",
        fundedFrom: "company_float",
        destination: COMPANY_ADVANCE_DESTINATION,
        issuedByAdminUid: actor.uid,
        createdAt: timestamp,
        completedAt: timestamp,
      });
      transaction.update(advanceRequestRef, {
        status: "approved",
        ...amounts,
        approvedAt: timestamp,
        approvedByAdminUid: actor.uid,
        advanceId: planned.advance.advanceId,
        approvedAmountInCentavos: planned.advance.amountInCentavos,
        updatedAt: timestamp,
      });
      transaction.update(bookingSnap.ref, {
        companyAdvanceId: planned.advance.advanceId,
        companyAdvanceRequestId: advanceRequestId,
        companyAdvanceRequestStatus: "approved",
        companyAdvanceStatus: "outstanding",
        companyAdvanceAmountInCentavos: planned.advance.amountInCentavos,
        companyAdvanceOutstandingInCentavos: planned.advance.amountInCentavos,
        companyAdvanceCommissionInCentavos: amounts.commissionAmountInCentavos,
        updatedAt: timestamp,
      });

      return planned.advance;
    });

    return {
      advanceId: approved.advanceId,
      advanceRequestId: approved.advanceRequestId,
      providerRequestId: approved.providerRequestId,
      providerId: approved.providerId,
      amountInCentavos: approved.amountInCentavos,
      currency: "PHP",
      status: "outstanding",
      mode: "mock",
      repaymentDestination: "company_float",
    };
  },
);

/** Plan + apply commission and optional advance repayment with preloaded snaps (reads already done). */
export function applyCompanyFloatPaymentSideEffectsInTransaction(input: {
  transaction: Transaction;
  floatSnap: DocumentSnapshot;
  commissionLedgerSnap: DocumentSnapshot;
  advanceSnap: DocumentSnapshot | null;
  paymentId: string;
  providerRequestId: string;
  providerId: string;
  commissionInCentavos: number;
  repayAmountInCentavos: number;
  providerRequestRef: DocumentReference;
}): void {
  let float = parseCompanyFloat(
    input.floatSnap.exists ? input.floatSnap.data() ?? {} : null,
  );
  const timestamp = serverTimestamp();
  const floatRef = floatReference();
  let floatTouched = false;
  let floatCreated = !input.floatSnap.exists;

  if (
    Number.isSafeInteger(input.commissionInCentavos) &&
    input.commissionInCentavos > 0
  ) {
    const planned = planCompanyFloatCommissionCredit({
      float,
      commissionInCentavos: input.commissionInCentavos,
      alreadyCredited: input.commissionLedgerSnap.exists,
    });
    if (planned.credited) {
      float = planned.float;
      floatTouched = true;
      input.transaction.create(
        db
          .collection("companyFloatLedgerEntries")
          .doc(companyFloatCommissionLedgerId(input.paymentId)),
        {
          schemaVersion: COMPANY_FLOAT_LEDGER_SCHEMA_VERSION,
          entryId: companyFloatCommissionLedgerId(input.paymentId),
          entryType: "commission_credit",
          paymentId: input.paymentId,
          providerRequestId: input.providerRequestId,
          providerId: input.providerId,
          amountInCentavos: planned.amountInCentavos,
          currency: "PHP",
          createdAt: timestamp,
        },
      );
    }
  }

  if (
    input.advanceSnap?.exists &&
    Number.isSafeInteger(input.repayAmountInCentavos) &&
    input.repayAmountInCentavos > 0
  ) {
    const advance = input.advanceSnap.data() ?? {};
    if (advance.status === "outstanding") {
      const outstanding = Number(
        advance.outstandingAmountInCentavos ?? advance.amountInCentavos ?? 0,
      );
      const repayAmount = Math.min(outstanding, input.repayAmountInCentavos);
      if (repayAmount > 0) {
        const planned = planCompanyAdvanceRepayment({
          float,
          advance,
          repayAmountInCentavos: repayAmount,
        });
        float = planned.float;
        floatTouched = true;
        input.transaction.update(input.advanceSnap.ref, {
          ...planned.advanceUpdate,
          updatedAt: timestamp,
          repaidAt:
            planned.advanceUpdate.status === "repaid"
              ? timestamp
              : advance.repaidAt ?? null,
        });
        input.transaction.update(input.providerRequestRef, {
          companyAdvanceStatus: planned.advanceUpdate.status,
          companyAdvanceOutstandingInCentavos:
            planned.advanceUpdate.outstandingAmountInCentavos,
          updatedAt: timestamp,
        });
      }
    }
  }

  if (!floatTouched) {
    return;
  }

  const floatPayload = {
    ...float,
    updatedAt: timestamp,
    lastCommissionCreditAt: timestamp,
    lastCommissionPaymentId: input.paymentId,
  };

  if (floatCreated) {
    input.transaction.create(floatRef, {
      ...floatPayload,
      createdAt: timestamp,
    });
  } else {
    input.transaction.update(floatRef, floatPayload);
  }
}

/** Legacy name used by webhook conflict path for commission-only credit. */
export function applyCompanyFloatCommissionCreditInTransaction(input: {
  transaction: Transaction;
  floatSnap: DocumentSnapshot;
  ledgerSnap: DocumentSnapshot;
  paymentId: string;
  providerRequestId: string;
  providerId: string;
  commissionInCentavos: number;
}): void {
  applyCompanyFloatPaymentSideEffectsInTransaction({
    transaction: input.transaction,
    floatSnap: input.floatSnap,
    commissionLedgerSnap: input.ledgerSnap,
    advanceSnap: null,
    paymentId: input.paymentId,
    providerRequestId: input.providerRequestId,
    providerId: input.providerId,
    commissionInCentavos: input.commissionInCentavos,
    repayAmountInCentavos: 0,
    providerRequestRef: db
      .collection("providerRequests")
      .doc(input.providerRequestId),
  });
}

export async function repayCompanyAdvanceForProviderRequestInTransaction(input: {
  transaction: Transaction;
  providerRequestId: string;
  repayAmountInCentavos: number;
}): Promise<number> {
  if (
    !Number.isSafeInteger(input.repayAmountInCentavos) ||
    input.repayAmountInCentavos <= 0
  ) {
    return 0;
  }

  const advanceRequestId = companyAdvanceRequestIdForProviderRequest(
    input.providerRequestId,
  );
  const advanceId = companyProviderAdvanceIdForRequest(advanceRequestId);
  const advanceRef = db.collection("companyProviderAdvances").doc(advanceId);
  const floatRef = floatReference();
  const bookingRef = db.collection("providerRequests").doc(input.providerRequestId);

  const [advanceSnap, floatSnap] = await Promise.all([
    input.transaction.get(advanceRef),
    input.transaction.get(floatRef),
  ]);

  if (!advanceSnap.exists) {
    return 0;
  }

  const advance = advanceSnap.data() ?? {};
  if (advance.status !== "outstanding") {
    return 0;
  }

  const outstanding = Number(
    advance.outstandingAmountInCentavos ?? advance.amountInCentavos ?? 0,
  );
  const repayAmount = Math.min(outstanding, input.repayAmountInCentavos);
  if (repayAmount <= 0) {
    return 0;
  }

  const float = parseCompanyFloat(
    floatSnap.exists ? floatSnap.data() ?? {} : null,
  );
  const planned = planCompanyAdvanceRepayment({
    float,
    advance,
    repayAmountInCentavos: repayAmount,
  });

  const timestamp = serverTimestamp();
  if (floatSnap.exists) {
    input.transaction.update(floatRef, {
      ...planned.float,
      updatedAt: timestamp,
      lastRepaidAt: timestamp,
      lastRepaidAdvanceId: advanceId,
    });
  }
  input.transaction.update(advanceRef, {
    ...planned.advanceUpdate,
    updatedAt: timestamp,
    repaidAt:
      planned.advanceUpdate.status === "repaid" ? timestamp : advance.repaidAt ?? null,
  });
  input.transaction.update(bookingRef, {
    companyAdvanceStatus: planned.advanceUpdate.status,
    companyAdvanceOutstandingInCentavos:
      planned.advanceUpdate.outstandingAmountInCentavos,
    updatedAt: timestamp,
  });

  return planned.repaidAmountInCentavos;
}

/**
 * At ordinary disbursement eligibility, repay outstanding company advance first.
 * Returns true when the full disbursement amount was consumed as company repayment
 * (provider should not receive a separate ordinary payout for that amount).
 */
export async function repayCompanyAdvanceForDisbursementInTransaction(input: {
  transaction: Transaction;
  disbursementRef: DocumentReference;
  disbursement: Readonly<Record<string, unknown>>;
  amountInCentavos: number;
  now: Date;
}): Promise<boolean> {
  void input.now;
  const providerRequestId = String(input.disbursement.providerRequestId ?? "");
  if (!providerRequestId) {
    return false;
  }

  const repaid = await repayCompanyAdvanceForProviderRequestInTransaction({
    transaction: input.transaction,
    providerRequestId,
    repayAmountInCentavos: input.amountInCentavos,
  });

  if (repaid <= 0) {
    return false;
  }

  if (repaid < input.amountInCentavos) {
    // Partial advance: leave remaining for ordinary ready path after reducing
    // is intentionally not supported in v1 — only full divert when advance
    // covers the whole obligation, otherwise keep ready for leftover handling.
    return false;
  }

  const timestamp = serverTimestamp();
  input.transaction.update(input.disbursementRef, {
    status: "paid",
    amountInCentavos: input.amountInCentavos,
    paidAt: timestamp,
    updatedAt: timestamp,
    activePayoutAttemptId: null,
    holdReason: null,
    nextCheckAt: null,
    paidVia: "company_advance_repayment",
    repaymentDestination: "company_float",
    companyAdvanceStatus: "repaid",
    transportMode: "disabled",
    readyAt: timestamp,
  });
  return true;
}

function floatReference() {
  return db
    .collection(COMPANY_FLOAT_DOC_PATH.collection)
    .doc(COMPANY_FLOAT_DOC_PATH.document);
}

function requireObject(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", message);
  }
  return value as Record<string, unknown>;
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,220}$/u.test(value)) {
    throw new HttpsError("invalid-argument", `${label} reference is invalid.`);
  }
  return value;
}

function toFailedPrecondition(error: unknown, fallback: string): HttpsError {
  const message =
    error instanceof Error
      ? error.message.replace(/^company_float:\s*/u, "")
      : fallback;
  return new HttpsError("failed-precondition", message || fallback);
}
