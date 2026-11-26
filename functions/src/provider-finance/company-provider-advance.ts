import {createHash} from "node:crypto";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";
import type {
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from "firebase-admin/firestore";

import {listActiveAdminUserIds} from "../shared/admin-recipients.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {db} from "../shared/firestore.js";
import {createNotificationWithIdInTransaction} from "../shared/notifications.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireRecentAuthentication} from "../shared/recent-auth.js";
import {serverTimestamp} from "../shared/timestamps.js";

import {
  COMPANY_ADVANCE_MAX_ATTEMPTS,
  COMPANY_COMMISSION_DOC_PATH,
  COMPANY_FLOAT_DOC_PATH,
  COMPANY_FLOAT_LEDGER_SCHEMA_VERSION,
  bookingPaymentIdsForEarnings,
  companyAdvancePayoutIdForAdvance,
  companyAdvanceRequestIdForProviderRequest,
  companyFloatCommissionLedgerId,
  companyProviderAdvanceIdForRequest,
  parseCompanyAdvanceAttemptCount,
  parseCompanyCommission,
  parseCompanyFloat,
  computeProviderAdvanceAmounts,
  planCompanyAdvanceApproval,
  planCompanyAdvanceRepayment,
  planCompanyAdvanceRequest,
  planCompanyCommissionCredit,
  planCompanyFloatFunding,
  planProviderEarningAdvanceAvailability,
  providerRequestHasCustomerPayment,
  remainingCompanyAdvanceAttempts,
} from "./company-float-domain.js";
import {
  releaseProviderSettlementAvailability,
  settlementIdForEarning,
} from "./provider-settlement-domain.js";
import {
  isCustomerPaidCommissionModel,
  isDirectProviderSplitRouting,
} from "../payments/platform-commission-policy.js";

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
  attemptCount: number;
  remainingAttempts: number;
  maxAttempts: typeof COMPANY_ADVANCE_MAX_ATTEMPTS;
};

export type ApproveCompanyAdvanceRequestResult = {
  advanceId: string;
  advanceRequestId: string;
  providerRequestId: string;
  providerId: string;
  amountInCentavos: number;
  currency: "PHP";
  status: "outstanding" | "repaid";
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
    const adminIds = await listActiveAdminUserIds();

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

      const financialSnapshot =
        booking.financialSnapshot &&
        typeof booking.financialSnapshot === "object" &&
        !Array.isArray(booking.financialSnapshot)
          ? (booking.financialSnapshot as Record<string, unknown>)
          : null;
      if (
        isDirectProviderSplitRouting(financialSnapshot?.settlementRoutingMode) ||
        isCustomerPaidCommissionModel(financialSnapshot?.platformCommissionModel) ||
        isCustomerPaidCommissionModel(booking.platformCommissionModel)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Immediate funding is not needed for direct-routed bookings because customer payments settle directly to your payout account.",
        );
      }

      const existingAdvanceRequest = advanceRequestSnap.exists
        ? advanceRequestSnap.data() ?? {}
        : null;

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
            existingAdvanceRequest
              ? String(existingAdvanceRequest.status ?? null)
              : null,
          existingAdvanceStatus:
            advanceSnap.exists
              ? String(advanceSnap.data()?.status ?? null)
              : null,
          existingAttemptCount: existingAdvanceRequest?.attemptCount,
          requestExists: advanceRequestSnap.exists,
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

      const notifyAdmins = (notificationRevision: number) => {
        for (const adminId of adminIds) {
          createNotificationWithIdInTransaction(
            transaction,
            companyAdvanceAdminNotificationId(
              planned.advanceRequestId,
              notificationRevision,
              adminId,
            ),
            {
              userId: adminId,
              title: "Immediate fund request",
              message:
                `A provider requested immediate funding from company float (attempt ${planned.attemptCount} of ${COMPANY_ADVANCE_MAX_ATTEMPTS}).`,
              type: "provider_immediate_fund_requested",
              relatedCollection: "companyAdvanceRequests",
              relatedId: planned.advanceRequestId,
              metadata: {
                providerRequestId,
                providerId,
                notificationRevision,
                attemptCount: planned.attemptCount,
                maxAttempts: COMPANY_ADVANCE_MAX_ATTEMPTS,
              },
            },
          );
        }
      };

      const {
        remainingAfterRequest: _remainingAfterRequest,
        ...plannedRecord
      } = planned;

      if (advanceRequestSnap.exists) {
        const existing = existingAdvanceRequest ?? {};
        if (existing.status === "rejected" || existing.status === "cancelled") {
          const timestamp = serverTimestamp();
          const notificationRevision =
            Number(existing.notificationRevision ?? 0) + 1;
          transaction.update(advanceRequestRef, {
            ...plannedRecord,
            status: "pending",
            ...amounts,
            attemptCount: planned.attemptCount,
            notificationRevision,
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
            companyAdvanceRequestAttemptCount: planned.attemptCount,
            companyAdvanceRequestMaxAttempts: COMPANY_ADVANCE_MAX_ATTEMPTS,
            updatedAt: timestamp,
          });
          notifyAdmins(notificationRevision);
          return planned;
        }
        throw new HttpsError(
          "failed-precondition",
          "An immediate funding request already exists for this booking.",
        );
      }

      const timestamp = serverTimestamp();
      const notificationRevision = 1;
      transaction.create(advanceRequestRef, {
        ...plannedRecord,
        ...amounts,
        attemptCount: planned.attemptCount,
        notificationRevision,
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
        companyAdvanceRequestAttemptCount: planned.attemptCount,
        companyAdvanceRequestMaxAttempts: COMPANY_ADVANCE_MAX_ATTEMPTS,
        updatedAt: timestamp,
      });
      notifyAdmins(notificationRevision);
      return planned;
    });

    return {
      advanceRequestId: result.advanceRequestId,
      providerRequestId: result.providerRequestId,
      status: "pending",
      attemptCount: result.attemptCount,
      remainingAttempts: result.remainingAfterRequest,
      maxAttempts: COMPANY_ADVANCE_MAX_ATTEMPTS,
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

      const providerRequestId = String(data.providerRequestId ?? "");
      const providerId = String(data.providerId ?? "");
      if (!/^[A-Za-z0-9_-]{1,220}$/u.test(providerRequestId)) {
        throw new HttpsError(
          "failed-precondition",
          "Advance request booking linkage is invalid.",
        );
      }
      if (!/^[A-Za-z0-9_-]{1,220}$/u.test(providerId)) {
        throw new HttpsError(
          "failed-precondition",
          "Advance request provider linkage is invalid.",
        );
      }

      const [providerSnap, bookingSnap] = await Promise.all([
        transaction.get(db.collection("providers").doc(providerId)),
        transaction.get(
          db.collection("providerRequests").doc(providerRequestId),
        ),
      ]);
      if (!providerSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Provider profile is unavailable.",
        );
      }
      if (!bookingSnap.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Advance request booking was not found.",
        );
      }
      const ownerId = String(providerSnap.data()?.ownerId ?? "");
      if (!/^[A-Za-z0-9_-]{1,220}$/u.test(ownerId)) {
        throw new HttpsError(
          "failed-precondition",
          "Provider owner is unavailable for rejection notice.",
        );
      }

      let amountFields: Record<string, number> = {};
      try {
        const amounts = computeProviderAdvanceAmounts(
          bookingSnap.data() ?? {},
        );
        amountFields = {
          grossAmountInCentavos: amounts.grossAmountInCentavos,
          commissionAmountInCentavos: amounts.commissionAmountInCentavos,
          providerNetAmountInCentavos: amounts.providerNetAmountInCentavos,
        };
      } catch {
        // Keep rejection available even if historical booking amounts are incomplete.
      }

      const attemptCount = Math.max(
        1,
        parseCompanyAdvanceAttemptCount(data.attemptCount) ||
          parseCompanyAdvanceAttemptCount(
            bookingSnap.data()?.companyAdvanceRequestAttemptCount,
          ) ||
          1,
      );
      const remainingAttempts = remainingCompanyAdvanceAttempts(attemptCount);
      const remainingMessage =
        remainingAttempts > 0
          ? `You have ${remainingAttempts} of ${COMPANY_ADVANCE_MAX_ATTEMPTS} immediate funding requests remaining for this booking.`
          : `You have used all ${COMPANY_ADVANCE_MAX_ATTEMPTS} immediate funding requests for this booking.`;

      const timestamp = serverTimestamp();
      const notificationRevision =
        Number(data.notificationRevision ?? 0) + 1;
      transaction.update(ref, {
        status: "rejected",
        rejectedAt: timestamp,
        rejectedByAdminUid: actor.uid,
        attemptCount,
        notificationRevision,
        updatedAt: timestamp,
        ...amountFields,
      });
      transaction.update(
        db.collection("providerRequests").doc(providerRequestId),
        {
          companyAdvanceRequestStatus: "rejected",
          companyAdvanceRequestAttemptCount: attemptCount,
          companyAdvanceRequestMaxAttempts: COMPANY_ADVANCE_MAX_ATTEMPTS,
          updatedAt: timestamp,
        },
      );
      createNotificationWithIdInTransaction(
        transaction,
        companyAdvanceProviderRejectionNotificationId(
          advanceRequestId,
          notificationRevision,
          ownerId,
        ),
        {
          userId: ownerId,
          title: "Immediate funding rejected",
          message:
            `FEASTA admin rejected your immediate funding request. ${remainingMessage}`,
          type: "provider_immediate_fund_rejected",
          relatedCollection: "providerRequests",
          relatedId: providerRequestId,
          metadata: {
            advanceRequestId,
            providerRequestId,
            providerId,
            notificationRevision,
            attemptCount,
            remainingAttempts,
            maxAttempts: COMPANY_ADVANCE_MAX_ATTEMPTS,
          },
        },
      );
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

      const advanceRequest = requestSnap.data() ?? {};
      const providerRequestId = String(advanceRequest.providerRequestId ?? "");
      const bookingSnap = await transaction.get(
        db.collection("providerRequests").doc(providerRequestId),
      );

      /*
       * Idempotent repair: an already-approved outstanding advance can still
       * release pending earnings into available if an older approve path
       * skipped that step.
       */
      if (advanceSnap.exists || payoutSnap.exists) {
        const existingAdvance = advanceSnap.exists
          ? advanceSnap.data() ?? {}
          : null;
        if (
          existingAdvance &&
          existingAdvance.status === "outstanding" &&
          typeof existingAdvance.providerRequestId === "string" &&
          bookingSnap.exists
        ) {
          const timestamp = serverTimestamp();
          const earningReleasePlans =
            await loadCompanyAdvanceEarningReleasePlans({
              transaction,
              providerRequestId: existingAdvance.providerRequestId,
              providerId: String(
                existingAdvance.providerId ??
                  advanceRequest.providerId ??
                  "",
              ),
              booking: bookingSnap.data() ?? {},
              timestamp,
            });
          for (const release of earningReleasePlans.releases) {
            transaction.update(release.earningRef, {
              ...release.earningUpdate,
              companyAdvanceId: existingAdvance.advanceId,
              companyAdvanceAvailabilityReleasedAt: timestamp,
              updatedAt: timestamp,
            });
            if (release.settlementRef && release.settlementUpdate) {
              transaction.update(release.settlementRef, {
                ...release.settlementUpdate,
                updatedAt: timestamp,
              });
            }
          }
          if (earningReleasePlans.releasedAmountInCentavos > 0) {
            transaction.update(bookingSnap.ref, {
              companyAdvanceEarningsReleasedInCentavos:
                earningReleasePlans.releasedAmountInCentavos,
              updatedAt: timestamp,
            });
          }
          return {
            advanceId: String(existingAdvance.advanceId),
            advanceRequestId:
              String(existingAdvance.advanceRequestId ?? advanceRequestId),
            providerRequestId: String(existingAdvance.providerRequestId),
            providerId: String(existingAdvance.providerId),
            amountInCentavos: Number(existingAdvance.amountInCentavos),
            currency: "PHP" as const,
            status: "outstanding" as const,
            mode: "mock" as const,
            repaymentDestination: "company_float" as const,
          };
        }
        throw new HttpsError(
          "failed-precondition",
          "This advance request was already approved.",
        );
      }

      if (!bookingSnap.exists) {
        throw new HttpsError("failed-precondition", "The booking was not found.");
      }
      const booking = bookingSnap.data() ?? {};
      const bookingFinancialSnapshot =
        booking.financialSnapshot &&
        typeof booking.financialSnapshot === "object" &&
        !Array.isArray(booking.financialSnapshot)
          ? (booking.financialSnapshot as Record<string, unknown>)
          : null;
      if (
        isDirectProviderSplitRouting(
          bookingFinancialSnapshot?.settlementRoutingMode,
        ) ||
        isCustomerPaidCommissionModel(
          bookingFinancialSnapshot?.platformCommissionModel,
        ) ||
        isCustomerPaidCommissionModel(booking.platformCommissionModel)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Immediate funding advances cannot be approved for direct-routed bookings.",
        );
      }
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
          settlementStatus: booking.settlementStatus,
        });
      } catch (error) {
        throw toFailedPrecondition(error, "Company advance could not be approved.");
      }

      const timestamp = serverTimestamp();
      const earningReleasePlans =
        await loadCompanyAdvanceEarningReleasePlans({
          transaction,
          providerRequestId,
          providerId: String(advanceRequest.providerId ?? booking.providerId ?? ""),
          booking,
          timestamp,
        });

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
        repaidAt:
          planned.advance.status === "repaid" ? timestamp : null,
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
        companyAdvanceStatus: planned.advance.status,
        updatedAt: timestamp,
      });
      transaction.update(bookingSnap.ref, {
        companyAdvanceId: planned.advance.advanceId,
        companyAdvanceRequestId: advanceRequestId,
        companyAdvanceRequestStatus: "approved",
        companyAdvanceStatus: planned.advance.status,
        companyAdvanceAmountInCentavos: planned.advance.amountInCentavos,
        companyAdvanceOutstandingInCentavos:
          planned.advance.outstandingAmountInCentavos,
        companyAdvanceCommissionInCentavos: amounts.commissionAmountInCentavos,
        companyAdvanceEarningsReleasedInCentavos:
          earningReleasePlans.releasedAmountInCentavos,
        updatedAt: timestamp,
      });

      for (const release of earningReleasePlans.releases) {
        transaction.update(release.earningRef, {
          ...release.earningUpdate,
          companyAdvanceId: planned.advance.advanceId,
          companyAdvanceAvailabilityReleasedAt: timestamp,
          updatedAt: timestamp,
        });
        if (release.settlementRef && release.settlementUpdate) {
          transaction.update(release.settlementRef, {
            ...release.settlementUpdate,
            updatedAt: timestamp,
          });
        }
      }

      return planned.advance;
    });

    return {
      advanceId: approved.advanceId,
      advanceRequestId: approved.advanceRequestId,
      providerRequestId: approved.providerRequestId,
      providerId: approved.providerId,
      amountInCentavos: approved.amountInCentavos,
      currency: "PHP",
      status:
        approved.status === "repaid" ? "repaid" : "outstanding",
      mode: "mock",
      repaymentDestination: "company_float",
    };
  },
);

/** Plan + apply commission wallet credit and optional advance repayment. */
export function applyCompanyFloatPaymentSideEffectsInTransaction(input: {
  transaction: Transaction;
  floatSnap: DocumentSnapshot;
  commissionSnap: DocumentSnapshot;
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
  let commission = parseCompanyCommission(
    input.commissionSnap.exists ? input.commissionSnap.data() ?? {} : null,
  );
  const timestamp = serverTimestamp();
  const floatRef = floatReference();
  const commissionRef = commissionReference();
  let floatTouched = false;
  let floatCreated = !input.floatSnap.exists;
  let commissionTouched = false;
  let commissionCreated = !input.commissionSnap.exists;

  if (
    Number.isSafeInteger(input.commissionInCentavos) &&
    input.commissionInCentavos > 0
  ) {
    const planned = planCompanyCommissionCredit({
      commission,
      commissionInCentavos: input.commissionInCentavos,
      alreadyCredited: input.commissionLedgerSnap.exists,
    });
    if (planned.credited) {
      commission = planned.commission;
      commissionTouched = true;
      input.transaction.create(
        db
          .collection("companyFloatLedgerEntries")
          .doc(companyFloatCommissionLedgerId(input.paymentId)),
        {
          schemaVersion: COMPANY_FLOAT_LEDGER_SCHEMA_VERSION,
          entryId: companyFloatCommissionLedgerId(input.paymentId),
          entryType: "commission_credit",
          destination: "company_commission",
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

  if (commissionTouched) {
    const commissionPayload = {
      ...commission,
      updatedAt: timestamp,
      lastCommissionCreditAt: timestamp,
      lastCommissionPaymentId: input.paymentId,
    };
    if (commissionCreated) {
      input.transaction.create(commissionRef, {
        ...commissionPayload,
        createdAt: timestamp,
      });
    } else {
      input.transaction.update(commissionRef, commissionPayload);
    }
  }

  if (!floatTouched) {
    return;
  }

  const floatPayload = {
    ...float,
    updatedAt: timestamp,
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
  commissionSnap: DocumentSnapshot;
  ledgerSnap: DocumentSnapshot;
  paymentId: string;
  providerRequestId: string;
  providerId: string;
  commissionInCentavos: number;
}): void {
  applyCompanyFloatPaymentSideEffectsInTransaction({
    transaction: input.transaction,
    floatSnap: input.floatSnap,
    commissionSnap: input.commissionSnap,
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

function commissionReference(): DocumentReference {
  return db
    .collection(COMPANY_COMMISSION_DOC_PATH.collection)
    .doc(COMPANY_COMMISSION_DOC_PATH.document);
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

async function loadCompanyAdvanceEarningReleasePlans(input: {
  transaction: Transaction;
  providerRequestId: string;
  providerId: string;
  booking: Readonly<Record<string, unknown>>;
  timestamp: unknown;
}): Promise<{
  releasedAmountInCentavos: number;
  releases: Array<{
    earningRef: DocumentReference;
    earningUpdate: Record<string, unknown>;
    settlementRef: DocumentReference | null;
    settlementUpdate: Record<string, unknown> | null;
  }>;
}> {
  const paymentIds = bookingPaymentIdsForEarnings(input.booking);
  const earningRefs =
    paymentIds.length > 0
      ? paymentIds.map((paymentId) =>
          db.collection("providerEarnings").doc(paymentId),
        )
      : [];

  const earningSnaps =
    earningRefs.length > 0
      ? await input.transaction.getAll(...earningRefs)
      : [];

  const matchedEarnings = earningSnaps.flatMap((snap) => {
    if (!snap.exists) {
      return [];
    }
    const data = snap.data() ?? {};
    if (
      data.providerRequestId !== input.providerRequestId ||
      (input.providerId &&
        data.providerId !== input.providerId)
    ) {
      return [];
    }
    return [{ref: snap.ref, data}];
  });

  /*
   * Fallback when booking payment pointers are missing: equality query on
   * providerRequestId (single-field, no composite index required).
   */
  const earnings =
    matchedEarnings.length > 0
      ? matchedEarnings
      : (
          await input.transaction.get(
            db
              .collection("providerEarnings")
              .where("providerRequestId", "==", input.providerRequestId),
          )
        ).docs
          .filter((doc) => {
            const data = doc.data();
            return (
              !input.providerId ||
              data.providerId === input.providerId
            );
          })
          .map((doc) => ({ref: doc.ref, data: doc.data()}));

  const settlementRefs = earnings.map((earning) =>
    db
      .collection("providerSettlements")
      .doc(settlementIdForEarning(earning.ref.id)),
  );
  const settlementSnaps =
    settlementRefs.length > 0
      ? await input.transaction.getAll(...settlementRefs)
      : [];

  const releases: Array<{
    earningRef: DocumentReference;
    earningUpdate: Record<string, unknown>;
    settlementRef: DocumentReference | null;
    settlementUpdate: Record<string, unknown> | null;
  }> = [];
  let releasedAmountInCentavos = 0;

  for (let index = 0; index < earnings.length; index += 1) {
    const earning = earnings[index];
    const settlementSnap = settlementSnaps[index];
    const settlement =
      settlementSnap?.exists ? settlementSnap.data() ?? {} : null;

    if (
      settlement &&
      settlement.status === "awaiting_availability"
    ) {
      try {
        const release = releaseProviderSettlementAvailability({
          settlement,
          earning: earning.data,
          timestamp: input.timestamp,
        });
        releases.push({
          earningRef: earning.ref,
          earningUpdate: release.earningUpdate,
          settlementRef: settlementSnap.ref,
          settlementUpdate: release.settlementUpdate,
        });
        releasedAmountInCentavos += Number(
          earning.data.pendingAmountInCentavos ?? 0,
        );
        continue;
      } catch {
        // Fall through to earning-only release when settlement cannot move.
      }
    }

    const planned = planProviderEarningAdvanceAvailability(earning.data);
    if (!planned) {
      continue;
    }
    releases.push({
      earningRef: earning.ref,
      earningUpdate: {
        status: planned.status,
        pendingAmountInCentavos: planned.pendingAmountInCentavos,
        availableAmountInCentavos: planned.availableAmountInCentavos,
        availableAt: input.timestamp,
      },
      settlementRef: null,
      settlementUpdate: null,
    });
    releasedAmountInCentavos += planned.releasedAmountInCentavos;
  }

  if (!Number.isSafeInteger(releasedAmountInCentavos) || releasedAmountInCentavos < 0) {
    throw new HttpsError(
      "failed-precondition",
      "Provider earning release amount for company advance is invalid.",
    );
  }

  return {releasedAmountInCentavos, releases};
}

function companyAdvanceAdminNotificationId(
  advanceRequestId: string,
  notificationRevision: number,
  adminId: string,
): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        "provider_immediate_fund_requested",
        advanceRequestId,
        notificationRevision,
        adminId,
      ]),
    )
    .digest("hex")
    .slice(0, 40);
  return `cadv_${digest}`;
}

function companyAdvanceProviderRejectionNotificationId(
  advanceRequestId: string,
  notificationRevision: number,
  ownerId: string,
): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify([
        "provider_immediate_fund_rejected",
        advanceRequestId,
        notificationRevision,
        ownerId,
      ]),
    )
    .digest("hex")
    .slice(0, 40);
  return `cadv_rej_${digest}`;
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
