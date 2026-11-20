import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {db} from "../shared/firestore.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireRecentAuthentication} from "../shared/recent-auth.js";
import {serverTimestamp} from "../shared/timestamps.js";

const RELEASE_CONFIRMATION_PHRASE = "RELEASE";

import {
  applyMockWithdrawalAllocation,
  buildMockWithdrawalRecord,
  mockWithdrawalIdForRequest,
  planMockWithdrawal,
  type MockWithdrawalSource,
} from "./provider-mock-withdrawal-domain.js";

const ADMIN_MOCK_DESTINATION = {
  type: "bank" as const,
  accountName: "Provider payout",
  bankName: "FEASTA Admin Mock",
  accountNumber: "999999999999",
};

export type ReleaseMockProviderDisbursementResult = {
  providerDisbursementId: string;
  withdrawalId: string;
  amountInCentavos: number;
  currency: "PHP";
  status: "succeeded";
  mode: "mock";
  providerId: string;
};

export const releaseMockProviderDisbursement = onCall(
  appCheckCallableOptions,
  async (request): Promise<ReleaseMockProviderDisbursementResult> => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.admin]);
    requireRecentAuthentication(request.auth?.token.auth_time);

    await enforceCallableRateLimit(request, {
      scope: "providerFinance.releaseMockProviderDisbursement",
      limit: 30,
      windowSeconds: 60 * 60,
    });

    const data = request.data;
    if (
      data === null ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Provide the disbursement identity and RELEASE confirmation.",
      );
    }

    const input = data as Record<string, unknown>;
    const keys = Object.keys(input).sort();
    if (
      keys.length !== 2 ||
      keys[0] !== "confirmationPhrase" ||
      keys[1] !== "providerDisbursementId"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Provide the disbursement identity and RELEASE confirmation.",
      );
    }

    if (input.confirmationPhrase !== RELEASE_CONFIRMATION_PHRASE) {
      throw new HttpsError(
        "invalid-argument",
        "Type RELEASE exactly to confirm this payout release.",
      );
    }

    const providerDisbursementId = input.providerDisbursementId;
    if (
      typeof providerDisbursementId !== "string" ||
      !/^[A-Za-z0-9_-]{1,220}$/u.test(providerDisbursementId)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "The Provider payout reference is invalid.",
      );
    }

    const disbursementRef = db
      .collection("providerDisbursements")
      .doc(providerDisbursementId);

    const existingDisbursement = await disbursementRef.get();
    if (!existingDisbursement.exists) {
      throw new HttpsError(
        "not-found",
        "The Provider payout obligation was not found.",
      );
    }

    const existingData = existingDisbursement.data() ?? {};
    if (
      existingData.status === "paid" &&
      existingData.mockRelease === true &&
      typeof existingData.mockWithdrawalId === "string"
    ) {
      return projectPaidResult(existingData, providerDisbursementId);
    }

    if (
      existingData.schemaVersion !== 1 ||
      existingData.policyVersion !== 1 ||
      existingData.disbursementId !== providerDisbursementId ||
      existingData.currency !== "PHP" ||
      existingData.status !== "ready" ||
      existingData.activePayoutAttemptId != null ||
      !Number.isSafeInteger(existingData.amountInCentavos) ||
      (existingData.amountInCentavos as number) <= 0 ||
      typeof existingData.providerId !== "string" ||
      !Array.isArray(existingData.sourceSettlementIds) ||
      existingData.sourceSettlementIds.length === 0
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Only a ready Provider payout obligation can be mock-released.",
      );
    }

    if (
      existingData.companyAdvanceStatus === "outstanding" ||
      existingData.repaymentDestination === "company_float"
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This payout obligation was prepaid from company float and will repay the company at eligibility.",
      );
    }

    const providerId = existingData.providerId as string;
    const sourceSettlementIds = existingData.sourceSettlementIds as string[];
    if (
      sourceSettlementIds.some(
        (id) => typeof id !== "string" || !/^[A-Za-z0-9:_-]{1,220}$/u.test(id),
      ) ||
      new Set(sourceSettlementIds).size !== sourceSettlementIds.length
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Provider payout source settlements are invalid.",
      );
    }

    const withdrawalId = mockWithdrawalIdForRequest(
      providerId,
      `admin_disbursement_${providerDisbursementId}`,
    );
    const withdrawalRef = db
      .collection("providerMockWithdrawals")
      .doc(withdrawalId);

    const existingWithdrawal = await withdrawalRef.get();
    if (existingWithdrawal.exists) {
      const withdrawal = existingWithdrawal.data() ?? {};
      if (existingData.status !== "paid") {
        throw new HttpsError(
          "failed-precondition",
          "A mock release record exists but the disbursement is not paid.",
        );
      }
      return projectPaidResult(
        {
          ...existingData,
          mockWithdrawalId: withdrawal.withdrawalId ?? withdrawalId,
          amountInCentavos:
            withdrawal.amountInCentavos ?? existingData.amountInCentavos,
        },
        providerDisbursementId,
      );
    }

    const result = await db.runTransaction(async (transaction) => {
      const disbursementSnap = await transaction.get(disbursementRef);
      if (!disbursementSnap.exists) {
        throw new HttpsError(
          "not-found",
          "The Provider payout obligation was not found.",
        );
      }

      const disbursement = disbursementSnap.data() ?? {};
      if (
        disbursement.status === "paid" &&
        disbursement.mockRelease === true
      ) {
        return {
          kind: "existing" as const,
          data: disbursement,
        };
      }

      if (
        disbursement.status !== "ready" ||
        disbursement.activePayoutAttemptId != null ||
        disbursement.amountInCentavos !== existingData.amountInCentavos ||
        disbursement.providerId !== providerId
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The Provider payout obligation changed before release.",
        );
      }

      const settlementSnaps = await Promise.all(
        sourceSettlementIds.map((settlementId) =>
          transaction.get(
            db.collection("providerSettlements").doc(settlementId),
          ),
        ),
      );

      const sources: MockWithdrawalSource[] = [];
      for (const settlementSnap of settlementSnaps) {
        if (!settlementSnap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "A source settlement is unavailable.",
          );
        }

        const settlement = settlementSnap.data() ?? {};
        const earningId =
          typeof settlement.earningId === "string"
            ? settlement.earningId
            : null;
        if (!earningId) {
          throw new HttpsError(
            "failed-precondition",
            "A settlement earning reference is invalid.",
          );
        }

        const earningSnap = await transaction.get(
          db.collection("providerEarnings").doc(earningId),
        );
        if (!earningSnap.exists) {
          throw new HttpsError(
            "failed-precondition",
            "A provider earning record is unavailable.",
          );
        }

        sources.push({
          settlement: {
            ...settlement,
            settlementId: settlement.settlementId ?? settlementSnap.id,
          },
          earning: earningSnap.data() ?? {},
        });
      }

      let plan;
      try {
        plan = planMockWithdrawal({
          providerId,
          withdrawalId,
          amountInCentavos: disbursement.amountInCentavos as number,
          sources,
          destination: ADMIN_MOCK_DESTINATION,
        });
      } catch (error) {
        throw new HttpsError(
          "failed-precondition",
          error instanceof Error
            ? stripMockPrefix(error.message)
            : "Mock payout could not be planned.",
        );
      }

      const timestamp = serverTimestamp();
      const earningState = new Map<string, Record<string, unknown>>();
      const settlementState = new Map<string, Record<string, unknown>>();

      for (const source of sources) {
        settlementState.set(
          String(source.settlement.settlementId),
          {...source.settlement},
        );
        earningState.set(
          String(source.earning.earningId),
          {...source.earning},
        );
      }

      for (const allocation of plan.allocations) {
        const settlement = settlementState.get(allocation.settlementId);
        const earning = earningState.get(allocation.earningId);
        if (!settlement || !earning) {
          throw new HttpsError(
            "failed-precondition",
            "Mock payout allocation references are unavailable.",
          );
        }

        let applied;
        try {
          applied = applyMockWithdrawalAllocation({
            settlement,
            earning,
            allocation,
            withdrawalId: plan.withdrawalId,
            destination: plan.destination,
            timestamp,
          });
        } catch (error) {
          throw new HttpsError(
            "failed-precondition",
            error instanceof Error
              ? stripMockPrefix(error.message)
              : "Mock payout could not be applied.",
          );
        }

        transaction.update(
          db.collection("providerSettlements").doc(allocation.settlementId),
          applied.settlementUpdate,
        );
        transaction.update(
          db.collection("providerEarnings").doc(allocation.earningId),
          applied.earningUpdate,
        );
        transaction.set(
          db.collection("providerPayoutAttempts").doc(allocation.payoutAttemptId),
          {
            ...applied.payoutAttemptRecord,
            providerDisbursementId,
            releaseChannel: "admin_disbursement",
          },
        );

        settlementState.set(allocation.settlementId, {
          ...settlement,
          ...applied.settlementUpdate,
        });
        earningState.set(allocation.earningId, {
          ...earning,
          ...applied.earningUpdate,
        });
      }

      const withdrawalRecord = {
        ...buildMockWithdrawalRecord({
          plan,
          providerId,
          clientRequestId: `admin_disbursement_${providerDisbursementId}`,
          timestamp,
        }),
        releaseChannel: "admin_disbursement",
        providerDisbursementId,
        releasedByAdminUid: actor.uid,
      };

      transaction.create(withdrawalRef, withdrawalRecord);
      transaction.update(disbursementRef, {
        status: "paid",
        paidAt: timestamp,
        updatedAt: timestamp,
        activePayoutAttemptId: null,
        mockRelease: true,
        mockWithdrawalId: plan.withdrawalId,
        mockReleasedByAdminUid: actor.uid,
        destinationSnapshot: plan.destination,
        transportMode: "disabled",
      });

      return {
        kind: "created" as const,
        data: {
          ...disbursement,
          amountInCentavos: plan.amountInCentavos,
          providerId,
          mockWithdrawalId: plan.withdrawalId,
          mockRelease: true,
        },
      };
    });

    return projectPaidResult(result.data, providerDisbursementId);
  },
);

function projectPaidResult(
  data: Record<string, unknown>,
  providerDisbursementId: string,
): ReleaseMockProviderDisbursementResult {
  if (
    typeof data.providerId !== "string" ||
    typeof data.mockWithdrawalId !== "string" ||
    !Number.isSafeInteger(data.amountInCentavos) ||
    (data.amountInCentavos as number) <= 0
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The mock payout result is invalid.",
    );
  }

  return {
    providerDisbursementId,
    withdrawalId: data.mockWithdrawalId,
    amountInCentavos: data.amountInCentavos as number,
    currency: "PHP",
    status: "succeeded",
    mode: "mock",
    providerId: data.providerId,
  };
}

function stripMockPrefix(message: string): string {
  return message.replace(/^Provider mock withdrawal invalid:\s*/u, "");
}
