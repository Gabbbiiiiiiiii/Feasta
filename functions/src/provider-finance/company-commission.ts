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

import {
  COMPANY_COMMISSION_DOC_PATH,
  COMPANY_FLOAT_DOC_PATH,
  COMPANY_FLOAT_LEDGER_SCHEMA_VERSION,
  companyCommissionTransferLedgerId,
  companyCommissionWithdrawalId,
  parseCompanyCommission,
  parseCompanyFloat,
  planCompanyCommissionTransferToFloat,
  planCompanyCommissionWithdrawal,
} from "./company-float-domain.js";
import {
  maskMockWithdrawalDestination,
  parseMockWithdrawalRequest,
} from "./provider-mock-withdrawal-domain.js";

const FLOAT_CONFIRMATION_PHRASE = "FLOAT";

export type TransferCompanyCommissionToFloatResult = {
  amountInCentavos: number;
  availableCommissionInCentavos: number;
  availableFloatInCentavos: number;
  outstandingAdvanceInCentavos: number;
  currency: "PHP";
  mode: "mock";
};

export type MockCompanyCommissionWithdrawalResult = {
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
  availableCommissionInCentavos: number;
  completedAt: string | null;
};

export const transferCompanyCommissionToFloat = onCall(
  appCheckCallableOptions,
  async (request): Promise<TransferCompanyCommissionToFloatResult> => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.admin]);
    requireRecentAuthentication(request.auth?.token.auth_time);

    await enforceCallableRateLimit(request, {
      scope: "providerFinance.transferCompanyCommissionToFloat",
      limit: 30,
      windowSeconds: 60 * 60,
    });

    const input = requireObject(
      request.data,
      "Provide the transfer amount and FLOAT confirmation.",
    );
    const keys = Object.keys(input).sort();
    if (
      keys.length !== 3 ||
      keys[0] !== "amountInCentavos" ||
      keys[1] !== "clientRequestId" ||
      keys[2] !== "confirmationPhrase"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Provide the transfer amount, client request identity, and FLOAT confirmation.",
      );
    }

    if (input.confirmationPhrase !== FLOAT_CONFIRMATION_PHRASE) {
      throw new HttpsError(
        "invalid-argument",
        "Type FLOAT exactly to confirm transferring commission into company float.",
      );
    }

    const amountInCentavos = input.amountInCentavos;
    if (!Number.isSafeInteger(amountInCentavos) || (amountInCentavos as number) <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "Commission transfer amount is invalid.",
      );
    }

    const clientRequestId = input.clientRequestId;
    if (
      typeof clientRequestId !== "string" ||
      clientRequestId.length < 8 ||
      clientRequestId.length > 80 ||
      !/^[A-Za-z0-9_-]+$/u.test(clientRequestId)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Client request identity is invalid.",
      );
    }

    const transferId = companyCommissionTransferLedgerId(clientRequestId);
    const transferRef = db.collection("companyFloatLedgerEntries").doc(transferId);
    const commissionRef = db
      .collection(COMPANY_COMMISSION_DOC_PATH.collection)
      .doc(COMPANY_COMMISSION_DOC_PATH.document);
    const floatRef = db
      .collection(COMPANY_FLOAT_DOC_PATH.collection)
      .doc(COMPANY_FLOAT_DOC_PATH.document);

    const result = await db.runTransaction(async (transaction) => {
      const [transferSnap, commissionSnap, floatSnap] = await Promise.all([
        transaction.get(transferRef),
        transaction.get(commissionRef),
        transaction.get(floatRef),
      ]);

      if (transferSnap.exists) {
        const existing = transferSnap.data() ?? {};
        if (
          existing.entryType !== "commission_to_float" ||
          !Number.isSafeInteger(existing.amountInCentavos) ||
          existing.amountInCentavos !== amountInCentavos
        ) {
          throw new HttpsError(
            "already-exists",
            "A different commission transfer already used this request identity.",
          );
        }
        const commission = parseCompanyCommission(
          commissionSnap.exists ? commissionSnap.data() ?? {} : null,
        );
        const float = parseCompanyFloat(
          floatSnap.exists ? floatSnap.data() ?? {} : null,
        );
        return {
          amountInCentavos: existing.amountInCentavos as number,
          availableCommissionInCentavos: commission.availableBalanceInCentavos,
          availableFloatInCentavos: float.availableBalanceInCentavos,
          outstandingAdvanceInCentavos: float.outstandingAdvanceInCentavos,
        };
      }

      let planned;
      try {
        planned = planCompanyCommissionTransferToFloat({
          commission: parseCompanyCommission(
            commissionSnap.exists ? commissionSnap.data() ?? {} : null,
          ),
          float: parseCompanyFloat(
            floatSnap.exists ? floatSnap.data() ?? {} : null,
          ),
          amountInCentavos: amountInCentavos as number,
        });
      } catch (error) {
        throw toFailedPrecondition(
          error,
          "Commission could not be transferred to company float.",
        );
      }

      const timestamp = serverTimestamp();
      const commissionPayload = {
        ...planned.commission,
        updatedAt: timestamp,
        lastTransferredToFloatAt: timestamp,
        lastTransferredToFloatByAdminUid: actor.uid,
        lastTransferredToFloatAmountInCentavos: planned.amountInCentavos,
      };
      const floatPayload = {
        ...planned.float,
        updatedAt: timestamp,
        lastCommissionTransferAt: timestamp,
        lastCommissionTransferByAdminUid: actor.uid,
        lastCommissionTransferAmountInCentavos: planned.amountInCentavos,
      };

      if (commissionSnap.exists) {
        transaction.update(commissionRef, commissionPayload);
      } else {
        transaction.create(commissionRef, {
          ...commissionPayload,
          createdAt: timestamp,
        });
      }

      if (floatSnap.exists) {
        transaction.update(floatRef, floatPayload);
      } else {
        transaction.create(floatRef, {
          ...floatPayload,
          createdAt: timestamp,
        });
      }

      transaction.create(transferRef, {
        schemaVersion: COMPANY_FLOAT_LEDGER_SCHEMA_VERSION,
        entryId: transferId,
        entryType: "commission_to_float",
        clientRequestId,
        amountInCentavos: planned.amountInCentavos,
        currency: "PHP",
        transferredByAdminUid: actor.uid,
        createdAt: timestamp,
      });

      return {
        amountInCentavos: planned.amountInCentavos,
        availableCommissionInCentavos:
          planned.commission.availableBalanceInCentavos,
        availableFloatInCentavos: planned.float.availableBalanceInCentavos,
        outstandingAdvanceInCentavos:
          planned.float.outstandingAdvanceInCentavos,
      };
    });

    return {
      ...result,
      currency: "PHP",
      mode: "mock",
    };
  },
);

export const requestMockCompanyCommissionWithdrawal = onCall(
  appCheckCallableOptions,
  async (request): Promise<MockCompanyCommissionWithdrawalResult> => {
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
    await requireRole(actor.uid, [USER_ROLES.admin]);
    requireRecentAuthentication(request.auth?.token.auth_time);

    await enforceCallableRateLimit(request, {
      scope: "providerFinance.requestMockCompanyCommissionWithdrawal",
      limit: 8,
      windowSeconds: 10 * 60,
    });

    const withdrawalId = companyCommissionWithdrawalId(parsed.clientRequestId);
    const withdrawalRef = db
      .collection("companyCommissionMockWithdrawals")
      .doc(withdrawalId);
    const commissionRef = db
      .collection(COMPANY_COMMISSION_DOC_PATH.collection)
      .doc(COMPANY_COMMISSION_DOC_PATH.document);

    const result = await db.runTransaction(async (transaction) => {
      const [withdrawalSnap, commissionSnap] = await Promise.all([
        transaction.get(withdrawalRef),
        transaction.get(commissionRef),
      ]);

      if (withdrawalSnap.exists) {
        return projectExistingWithdrawal(
          withdrawalSnap.data() ?? {},
          parseCompanyCommission(
            commissionSnap.exists ? commissionSnap.data() ?? {} : null,
          ).availableBalanceInCentavos,
          parsed.amountInCentavos,
        );
      }

      let planned;
      try {
        planned = planCompanyCommissionWithdrawal({
          commission: parseCompanyCommission(
            commissionSnap.exists ? commissionSnap.data() ?? {} : null,
          ),
          amountInCentavos: parsed.amountInCentavos,
        });
      } catch (error) {
        throw toFailedPrecondition(
          error,
          "Commission withdrawal could not be completed.",
        );
      }

      const destination = maskMockWithdrawalDestination(parsed.destination);
      const timestamp = serverTimestamp();
      const commissionPayload = {
        ...planned.commission,
        updatedAt: timestamp,
        lastWithdrawnAt: timestamp,
        lastWithdrawnByAdminUid: actor.uid,
        lastWithdrawnAmountInCentavos: planned.amountInCentavos,
      };

      if (commissionSnap.exists) {
        transaction.update(commissionRef, commissionPayload);
      } else {
        transaction.create(commissionRef, {
          ...commissionPayload,
          createdAt: timestamp,
        });
      }

      transaction.create(withdrawalRef, {
        schemaVersion: 1,
        withdrawalId,
        clientRequestId: parsed.clientRequestId,
        mode: "mock",
        currency: "PHP",
        amountInCentavos: planned.amountInCentavos,
        status: "succeeded",
        destination,
        withdrawnByAdminUid: actor.uid,
        createdAt: timestamp,
        updatedAt: timestamp,
        completedAt: timestamp,
      });

      return {
        withdrawalId,
        amountInCentavos: planned.amountInCentavos,
        currency: "PHP" as const,
        status: "succeeded" as const,
        mode: "mock" as const,
        destination,
        availableCommissionInCentavos:
          planned.commission.availableBalanceInCentavos,
        completedAt: new Date().toISOString(),
      };
    });

    return result;
  },
);

function projectExistingWithdrawal(
  data: Record<string, unknown>,
  availableCommissionInCentavos: number,
  requestedAmountInCentavos: number,
): MockCompanyCommissionWithdrawalResult {
  if (
    data.schemaVersion !== 1 ||
    data.mode !== "mock" ||
    data.currency !== "PHP" ||
    data.status !== "succeeded" ||
    typeof data.withdrawalId !== "string" ||
    !Number.isSafeInteger(data.amountInCentavos) ||
    data.amountInCentavos !== requestedAmountInCentavos
  ) {
    throw new HttpsError(
      "already-exists",
      "A different commission withdrawal already used this request identity.",
    );
  }

  const destination =
    data.destination &&
    typeof data.destination === "object" &&
    !Array.isArray(data.destination)
      ? (data.destination as Record<string, unknown>)
      : null;

  if (
    !destination ||
    (destination.type !== "gcash" && destination.type !== "bank") ||
    typeof destination.accountName !== "string"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Existing commission withdrawal record is invalid.",
    );
  }

  return {
    withdrawalId: data.withdrawalId,
    amountInCentavos: data.amountInCentavos as number,
    currency: "PHP",
    status: "succeeded",
    mode: "mock",
    destination: {
      type: destination.type,
      accountName: destination.accountName,
      mobileMasked:
        typeof destination.mobileMasked === "string"
          ? destination.mobileMasked
          : null,
      bankName:
        typeof destination.bankName === "string" ? destination.bankName : null,
      accountNumberMasked:
        typeof destination.accountNumberMasked === "string"
          ? destination.accountNumberMasked
          : null,
    },
    availableCommissionInCentavos,
    completedAt:
      data.completedAt &&
      typeof (data.completedAt as {toDate?: () => Date}).toDate === "function"
        ? (data.completedAt as {toDate: () => Date}).toDate().toISOString()
        : null,
  };
}

function requireObject(
  value: unknown,
  message: string,
): Record<string, unknown> {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", message);
  }
  return value as Record<string, unknown>;
}

function toFailedPrecondition(error: unknown, fallback: string): HttpsError {
  const message =
    error instanceof Error && error.message.startsWith("company_float:")
      ? error.message.replace(/^company_float:\s*/u, "")
      : fallback;
  return new HttpsError("failed-precondition", message);
}

function stripMockPrefix(message: string): string {
  return message.replace(/^mock_withdrawal:\s*/u, "");
}
