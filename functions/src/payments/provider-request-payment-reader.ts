import type {
  DocumentReference,
  Transaction,
} from "firebase-admin/firestore";

import {db} from "../shared/firestore.js";
import {
  canonicalPaymentLinkageReason,
} from "./payment-lifecycle.js";
import {
  providerRequestPaymentReadPlan,
  type ProviderRequestPaymentReadPlan,
} from "./provider-request-payment-set.js";
import {
  resolveProviderRequestSettlement,
  type ProviderRequestSettlement,
  type ProviderSettlementPayment,
} from "./payment-settlement.js";

type UnknownRecord =
  Readonly<Record<string, unknown>>;

type TrustedPaymentSetCommon = {
  plan:
    ProviderRequestPaymentReadPlan;

  payments:
    readonly ProviderSettlementPayment[];

  currentPaymentId:
    string;

  currentPayment:
    UnknownRecord | null;

  currentPaymentReference:
    DocumentReference;
};

export type TrustedProviderRequestPaymentSet =
  | (
    TrustedPaymentSetCommon & {
      mode:
        "legacy";

      settlement:
        null;
    }
  )
  | (
    TrustedPaymentSetCommon & {
      mode:
        "p5";

      settlement:
        ProviderRequestSettlement;
    }
  );

/**
 * Reads and validates the payment set from the provider-request
 * snapshot already read inside the same Firestore transaction.
 *
 * The pre-transaction provider-request snapshot is never payment
 * history authority.
 */
export async function readTrustedProviderRequestPaymentSetInTransaction(
  input: {
    transaction:
      Transaction;

    providerRequestId:
      string;

    providerRequest:
      UnknownRecord;

    mainEventId:
      string;

    customerId:
      string;

    providerId:
      string;

    mainEvent:
      UnknownRecord;

    invalid:
      () => never;
  },
): Promise<TrustedProviderRequestPaymentSet> {
  let plan:
    ProviderRequestPaymentReadPlan;

  try {
    plan =
      providerRequestPaymentReadPlan(
        input.providerRequestId,
        input.providerRequest,
      );
  }
  catch {
    return input.invalid();
  }

  const paymentReferences =
    plan.paymentIds.map(
      (paymentId) =>
        db.collection("payments")
          .doc(paymentId),
    );

  const paymentSnapshots =
    await input.transaction.getAll(
      ...paymentReferences,
    );

  const payments:
    ProviderSettlementPayment[] =
      [];

  for (
    let index = 0;
    index < paymentSnapshots.length;
    index += 1
  ) {
    const snapshot =
      paymentSnapshots[index];

    if (!snapshot.exists) {
      continue;
    }

    const paymentId =
      plan.paymentIds[index];

    const payment =
      snapshot.data() ?? {};

    if (
      canonicalPaymentLinkageReason({
        paymentId,
        providerRequestId:
          input.providerRequestId,
        mainEventId:
          input.mainEventId,
        customerId:
          input.customerId,
        providerId:
          input.providerId,
        payment,
        providerRequest:
          input.providerRequest,
        mainEvent:
          input.mainEvent,
      })
    ) {
      return input.invalid();
    }

    payments.push({
      id:
        paymentId,

      data:
        payment,
    });
  }

  const currentPayment =
    payments.find(
      (payment) =>
        payment.id ===
        plan.currentPaymentId,
    )?.data ?? null;

  const currentPaymentReference =
    db.collection("payments")
      .doc(plan.currentPaymentId);

  if (plan.mode === "legacy") {
    return {
      mode:
        "legacy",

      plan,

      payments,

      currentPaymentId:
        plan.currentPaymentId,

      currentPayment,

      currentPaymentReference,

      settlement:
        null,
    };
  }

  let settlement:
    ProviderRequestSettlement;

  try {
    settlement =
      resolveProviderRequestSettlement({
        providerRequestId:
          input.providerRequestId,

        providerRequest:
          input.providerRequest,

        payments,
      });
  }
  catch {
    return input.invalid();
  }

  return {
    mode:
      "p5",

    plan,

    payments,

    currentPaymentId:
      plan.currentPaymentId,

    currentPayment,

    currentPaymentReference,

    settlement,
  };
}
