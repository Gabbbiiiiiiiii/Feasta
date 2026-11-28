import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  isApprovedProviderForOperations,
  USER_ROLES,
} from "../shared/constants.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {db} from "../shared/firestore.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";

import {
  applyMockWithdrawalAllocation,
  buildMockWithdrawalRecord,
  mockWithdrawalIdForRequest,
  parseMockWithdrawalRequest,
  planMockWithdrawal,
  type MockWithdrawalSource,
} from "./provider-mock-withdrawal-domain.js";

const callableOptions = {
  ...appCheckCallableOptions,
  timeoutSeconds: 30,
};

export type MockProviderWithdrawalResult = {
  withdrawalId: string;
  amountInCentavos: number;
  currency: "PHP";
  status: "succeeded";
  mode: "mock";
  destination: {
    type: "gcash" | "bank";
    accountName: string;
    mobileMasked: string | null;
    bankName: string | null;
    accountNumberMasked: string | null;
  };
  allocationCount: number;
  completedAt: string | null;
};

export const requestMockProviderWithdrawal = onCall(
  callableOptions,
  async (request): Promise<MockProviderWithdrawalResult> => {
    let parsed;
    try {
      parsed = parseMockWithdrawalRequest(request.data);
    } catch (error) {
      throw new HttpsError(
        "invalid-argument",
        error instanceof Error
          ? stripMockPrefix(error.message)
          : "Withdrawal request is invalid.",
      );
    }

    const actor = requireAuth(request);

    await requireRole(actor.uid, [USER_ROLES.provider]);

    await enforceCallableRateLimit(request, {
      scope: "providerFinance.requestMockWithdrawal",
      limit: 8,
      windowSeconds: 10 * 60,
    });

    const providerId = await requireApprovedProviderId(actor.uid);
    const withdrawalId = mockWithdrawalIdForRequest(
      providerId,
      parsed.clientRequestId,
    );

    const withdrawalRef = db
      .collection("providerMockWithdrawals")
      .doc(withdrawalId);

    const existing = await withdrawalRef.get();
    if (existing.exists) {
      return projectExistingWithdrawal(existing.data() ?? {}, parsed.amountInCentavos);
    }

    const settlementsSnapshot = await db
      .collection("providerSettlements")
      .where("providerId", "==", providerId)
      .get();

    const readyDocs = settlementsSnapshot.docs.filter((doc) => {
      const data = doc.data();
      return (
        data.status === "ready" &&
        data.reconciliationRequired !== true &&
        data.activePayoutAttemptId == null &&
        Number(data.reservedAmountInCentavos ?? 0) === 0
      );
    });

    if (readyDocs.length === 0) {
      throw new HttpsError(
        "failed-precondition",
        "No available earnings are ready to withdraw.",
      );
    }

    const earningIds = [...new Set(
      readyDocs
        .map((doc) => safeId(doc.data().earningId))
        .filter((value): value is string => Boolean(value)),
    )];

    const earningRefs = earningIds.map((earningId) =>
      db.collection("providerEarnings").doc(earningId),
    );

    const result = await db.runTransaction(async (transaction) => {
      const existingInTx = await transaction.get(withdrawalRef);
      if (existingInTx.exists) {
        return {
          kind: "existing" as const,
          data: existingInTx.data() ?? {},
        };
      }

      const settlementSnaps = await Promise.all(
        readyDocs.map((doc) => transaction.get(doc.ref)),
      );
      const earningSnaps = await Promise.all(
        earningRefs.map((ref) => transaction.get(ref)),
      );

      const earningsById = new Map(
        earningSnaps.map((snap) => [snap.id, snap]),
      );

      const sources: MockWithdrawalSource[] = [];
      for (const settlementSnap of settlementSnaps) {
        if (!settlementSnap.exists) {
          continue;
        }

        const settlement = settlementSnap.data() ?? {};
        const earningId = safeId(settlement.earningId);
        if (!earningId) {
          throw new HttpsError(
            "failed-precondition",
            "A settlement earning reference is invalid.",
          );
        }

        const earningSnap = earningsById.get(earningId);
        if (!earningSnap?.exists) {
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
          amountInCentavos: parsed.amountInCentavos,
          sources,
          destination: parsed.destination,
        });
      } catch (error) {
        throw new HttpsError(
          "failed-precondition",
          error instanceof Error
            ? stripMockPrefix(error.message)
            : "Withdrawal could not be planned.",
        );
      }

      const timestamp = serverTimestamp();
      const earningState = new Map<string, Record<string, unknown>>();
      const settlementState = new Map<string, Record<string, unknown>>();

      for (const source of sources) {
        const settlementId = String(source.settlement.settlementId);
        const earningId = String(source.earning.earningId);
        settlementState.set(settlementId, {...source.settlement});
        earningState.set(earningId, {...source.earning});
      }

      for (const allocation of plan.allocations) {
        const settlement = settlementState.get(allocation.settlementId);
        const earning = earningState.get(allocation.earningId);

        if (!settlement || !earning) {
          throw new HttpsError(
            "failed-precondition",
            "Withdrawal allocation references are unavailable.",
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
              : "Withdrawal could not be applied.",
          );
        }

        const settlementRef = db
          .collection("providerSettlements")
          .doc(allocation.settlementId);
        const earningRef = db
          .collection("providerEarnings")
          .doc(allocation.earningId);
        const attemptRef = db
          .collection("providerPayoutAttempts")
          .doc(allocation.payoutAttemptId);

        transaction.update(settlementRef, applied.settlementUpdate);
        transaction.update(earningRef, applied.earningUpdate);
        transaction.set(attemptRef, applied.payoutAttemptRecord);

        settlementState.set(allocation.settlementId, {
          ...settlement,
          ...applied.settlementUpdate,
        });
        earningState.set(allocation.earningId, {
          ...earning,
          ...applied.earningUpdate,
        });
      }

      const withdrawalRecord = buildMockWithdrawalRecord({
        plan,
        providerId,
        clientRequestId: parsed.clientRequestId,
        timestamp,
      });

      transaction.create(withdrawalRef, withdrawalRecord);

      return {
        kind: "created" as const,
        data: withdrawalRecord,
      };
    });

    return projectExistingWithdrawal(
      result.data,
      parsed.amountInCentavos,
    );
  },
);

async function requireApprovedProviderId(
  actorUid: string,
): Promise<string> {
  const userSnapshot = await db.collection("users").doc(actorUid).get();
  if (!userSnapshot.exists) {
    throw new HttpsError(
      "permission-denied",
      "Provider account is unavailable.",
    );
  }

  const providerId = safeId(userSnapshot.data()?.providerId);
  if (!providerId) {
    throw new HttpsError(
      "failed-precondition",
      "Complete Provider registration before withdrawing earnings.",
    );
  }

  const providerSnapshot = await db.collection("providers").doc(providerId).get();
  if (!providerSnapshot.exists) {
    throw new HttpsError(
      "failed-precondition",
      "Provider profile is unavailable.",
    );
  }

  const provider = providerSnapshot.data() ?? {};
  if (
    provider.ownerId !== actorUid ||
    !isApprovedProviderForOperations(provider)
  ) {
    throw new HttpsError(
      "permission-denied",
      "Only an approved active Provider may withdraw earnings.",
    );
  }

  return providerId;
}

function projectExistingWithdrawal(
  data: Record<string, unknown>,
  expectedAmountInCentavos: number,
): MockProviderWithdrawalResult {
  if (
    data.schemaVersion !== 1 ||
    data.mode !== "mock" ||
    data.status !== "succeeded" ||
    data.currency !== "PHP" ||
    typeof data.withdrawalId !== "string" ||
    !Number.isSafeInteger(data.amountInCentavos)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "An existing withdrawal record is invalid.",
    );
  }

  if (data.amountInCentavos !== expectedAmountInCentavos) {
    throw new HttpsError(
      "already-exists",
      "This withdrawal request was already completed with a different amount.",
    );
  }

  const destination = data.destination;
  if (
    !destination ||
    typeof destination !== "object" ||
    Array.isArray(destination)
  ) {
    throw new HttpsError(
      "failed-precondition",
      "An existing withdrawal destination is invalid.",
    );
  }

  const dest = destination as Record<string, unknown>;
  if (dest.type !== "gcash" && dest.type !== "bank") {
    throw new HttpsError(
      "failed-precondition",
      "An existing withdrawal destination is invalid.",
    );
  }

  const allocations = Array.isArray(data.allocations)
    ? data.allocations
    : [];

  return {
    withdrawalId: data.withdrawalId,
    amountInCentavos: data.amountInCentavos as number,
    currency: "PHP",
    status: "succeeded",
    mode: "mock",
    destination: {
      type: dest.type,
      accountName:
        typeof dest.accountName === "string" ? dest.accountName : "",
      mobileMasked:
        typeof dest.mobileMasked === "string" ? dest.mobileMasked : null,
      bankName:
        typeof dest.bankName === "string" ? dest.bankName : null,
      accountNumberMasked:
        typeof dest.accountNumberMasked === "string"
          ? dest.accountNumberMasked
          : null,
    },
    allocationCount: allocations.length,
    completedAt: serializeTimestamp(data.completedAt),
  };
}

function serializeTimestamp(value: unknown): string | null {
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as {toDate?: unknown}).toDate === "function"
  ) {
    return (value as {toDate: () => Date}).toDate().toISOString();
  }

  if (typeof value === "string") {
    return value;
  }

  return null;
}

function stripMockPrefix(message: string): string {
  return message.replace(/^Provider mock withdrawal invalid:\s*/u, "");
}

function safeId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return /^[A-Za-z0-9:_-]{1,220}$/u.test(normalized)
    ? normalized
    : null;
}
