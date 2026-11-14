const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  Timestamp,
} =
  require("firebase-admin/firestore");

const libRoot =
  path.resolve(
    __dirname,
    "../lib",
  );

const {
  buildProviderRequestFinancialSnapshot,
} = require(path.join(
  libRoot,
  "provider-requests/provider-request-financial-snapshot.js",
));

const {
  paymentIdForProviderRequestChoice,
  providerPaymentObligationForChoice,
} = require(path.join(
  libRoot,
  "payments/payment-obligation.js",
));

const {
  resolveProviderRequestSettlement,
} = require(path.join(
  libRoot,
  "payments/payment-settlement.js",
));

const {
  calculateRefundAmounts,
} = require(path.join(
  libRoot,
  "refunds/refund-accounting-domain.js",
));

const REQUEST_ID =
  "request_p13_g";

const fullPaymentTerms = {
  schemaVersion: 1,
  source: "canonical_package",
  paymentPolicy: "full_payment",
  depositRateBps: 10_000,
  balanceDueDaysBeforeEvent: null,
  usesLegacyPaymentTerms: false,
};

const legacyDepositTerms = {
  schemaVersion: 1,
  source: "canonical_package",
  paymentPolicy: "deposit_then_balance",
  depositRateBps: 2_500,
  balanceDueDaysBeforeEvent: 7,
  usesLegacyPaymentTerms: false,
};

function snapshotFor({
  amount,
  downPaymentAmount,
  remainingBalance,
  packagePaymentTerms,
  packagePrice,
}) {
  return buildProviderRequestFinancialSnapshot({
    providerId: "provider_test",
    providerOwnerId: "owner_test",
    providerRequest: {
      amount,
      downPaymentAmount,
      remainingBalance,
      packagePaymentTerms,
      packagePrice,
    },
    platformSettings: null,
    providerTaxProfile: null,
  });
}

function selectedRequest(
  financialSnapshot,
  paymentChoice,
) {
  const initialPaymentId =
    paymentIdForProviderRequestChoice(
      REQUEST_ID,
      paymentChoice,
    );

  return {
    initialPaymentChoice: paymentChoice,
    initialPaymentId,
    paymentId: initialPaymentId,
    remainingBalancePaymentId: null,
    financialSnapshot,
  };
}

function paymentDocument(
  providerRequest,
  paymentChoice,
  status,
) {
  const paymentId =
    paymentIdForProviderRequestChoice(
      REQUEST_ID,
      paymentChoice,
    );
  const obligation =
    providerPaymentObligationForChoice({
      financialSnapshot:
        providerRequest.financialSnapshot,
      paymentChoice,
    });
  const settled =
    status === "paid" ||
    status === "partially_refunded" ||
    status === "refunded";

  return {
    id: paymentId,
    data: {
      paymentId,
      providerRequestId: REQUEST_ID,
      obligationSchemaVersion: obligation.schemaVersion,
      paymentChoice: obligation.paymentChoice,
      obligationKey: obligation.obligationKey,
      obligationKind: obligation.obligationKind,
      paymentType: obligation.paymentType,
      amountInCentavos: obligation.amountInCentavos,
      currency: "PHP",
      status,
      paidAt: settled
        ? Timestamp.fromMillis(1_700_000_000_000)
        : null,
    },
  };
}

function settle(
  providerRequest,
  payments,
) {
  return resolveProviderRequestSettlement({
    providerRequestId: REQUEST_ID,
    providerRequest,
    payments,
  });
}

test(
  "P13-G new full-payment booking freezes 20000 upfront and zero remaining",
  () => {
    const snapshot = snapshotFor({
      amount: 20_000,
      downPaymentAmount: 20_000,
      remainingBalance: 0,
      packagePaymentTerms: fullPaymentTerms,
    });

    assert.equal(snapshot.grossAmountInCentavos, 2_000_000);
    assert.equal(
      snapshot.requiredUpfrontAmountInCentavos,
      2_000_000,
    );
    assert.equal(snapshot.remainingBalanceInCentavos, 0);
    assert.equal(snapshot.requiredUpfrontRateBps, 10_000);
    assert.equal(
      snapshot.packagePaymentTerms.paymentPolicy,
      "full_payment",
    );
    assert.equal(
      snapshot.packagePaymentTerms.depositRateBps,
      10_000,
    );

    const full = providerPaymentObligationForChoice({
      financialSnapshot: snapshot,
      paymentChoice: "full",
    });

    assert.equal(full.amountInCentavos, 2_000_000);
    assert.equal(full.obligationKey, "initial_full");

    for (const paymentChoice of ["minimum", "remaining_balance"]) {
      assert.throws(
        () => providerPaymentObligationForChoice({
          financialSnapshot: snapshot,
          paymentChoice,
        }),
        {code: "failed-precondition"},
      );
    }
  },
);

test(
  "P13-G legacy deposit 20000/5000/15000 stays a deposit obligation",
  () => {
    const snapshot = snapshotFor({
      amount: 20_000,
      downPaymentAmount: 5_000,
      remainingBalance: 15_000,
      packagePaymentTerms: legacyDepositTerms,
    });

    assert.equal(
      snapshot.packagePaymentTerms.paymentPolicy,
      "deposit_then_balance",
    );
    assert.equal(snapshot.grossAmountInCentavos, 2_000_000);
    assert.equal(
      snapshot.requiredUpfrontAmountInCentavos,
      500_000,
    );
    assert.equal(snapshot.remainingBalanceInCentavos, 1_500_000);
    assert.equal(snapshot.requiredUpfrontRateBps, 2_500);

    assert.equal(
      providerPaymentObligationForChoice({
        financialSnapshot: snapshot,
        paymentChoice: "minimum",
      }).paymentType,
      "provider_down_payment",
    );
    assert.equal(
      providerPaymentObligationForChoice({
        financialSnapshot: snapshot,
        paymentChoice: "remaining_balance",
      }).paymentType,
      "provider_balance",
    );
    assert.equal(
      providerPaymentObligationForChoice({
        financialSnapshot: snapshot,
        paymentChoice: "full",
      }).amountInCentavos,
      2_000_000,
    );
  },
);

test(
  "P13-G paying a legacy deposit in full settles once and rejects a duplicate copy",
  () => {
    const snapshot = snapshotFor({
      amount: 20_000,
      downPaymentAmount: 5_000,
      remainingBalance: 15_000,
      packagePaymentTerms: legacyDepositTerms,
    });
    const providerRequest = selectedRequest(snapshot, "full");
    const paid = paymentDocument(
      providerRequest,
      "full",
      "paid",
    );

    const first = settle(providerRequest, [paid]);
    const replay = settle(providerRequest, [paid]);

    assert.equal(first.status, "fully_settled");
    assert.equal(first.grossSettledAmountInCentavos, 2_000_000);
    assert.equal(first.outstandingAmountInCentavos, 0);
    assert.equal(first.fullySettled, true);
    assert.deepEqual(replay, first);
    assert.equal(
      providerRequest.remainingBalancePaymentId,
      null,
    );

    assert.throws(
      () => settle(providerRequest, [paid, paid]),
      /settlement is invalid/u,
    );
  },
);

test(
  "P13-G full-payment settlement stays readable after success and failed checkout",
  () => {
    const snapshot = snapshotFor({
      amount: 20_000,
      downPaymentAmount: 20_000,
      remainingBalance: 0,
      packagePaymentTerms: fullPaymentTerms,
    });
    const providerRequest = selectedRequest(snapshot, "full");
    const failed = paymentDocument(
      providerRequest,
      "full",
      "failed",
    );
    const abandoned = settle(providerRequest, [failed]);

    assert.equal(abandoned.status, "unpaid");
    assert.equal(abandoned.grossSettledAmountInCentavos, 0);
    assert.equal(abandoned.outstandingAmountInCentavos, 2_000_000);
    assert.equal(abandoned.fullySettled, false);

    const paid = paymentDocument(
      providerRequest,
      "full",
      "paid",
    );
    const settled = settle(providerRequest, [paid]);
    const replay = settle(providerRequest, [paid]);

    assert.equal(settled.status, "fully_settled");
    assert.equal(settled.grossSettledAmountInCentavos, 2_000_000);
    assert.equal(settled.outstandingAmountInCentavos, 0);
    assert.deepEqual(replay, settled);
    assert.throws(
      () => settle(providerRequest, [paid, {...paid}]),
      /settlement is invalid/u,
    );
  },
);

test(
  "P13-G current package price does not change the frozen request amount",
  () => {
    const snapshot = snapshotFor({
      amount: 20_000,
      downPaymentAmount: 20_000,
      remainingBalance: 0,
      packagePaymentTerms: fullPaymentTerms,
      packagePrice: 99_999.99,
    });

    assert.equal(snapshot.grossAmountInCentavos, 2_000_000);
    assert.equal(
      snapshot.requiredUpfrontAmountInCentavos,
      2_000_000,
    );
    assert.equal(snapshot.remainingBalanceInCentavos, 0);
  },
);

test(
  "P13-G non-round 12345.67 freezes without centavo drift",
  () => {
    const snapshot = snapshotFor({
      amount: 12_345.67,
      downPaymentAmount: 12_345.67,
      remainingBalance: 0,
      packagePaymentTerms: fullPaymentTerms,
    });

    assert.equal(snapshot.grossAmountInCentavos, 1_234_567);
    assert.equal(
      snapshot.requiredUpfrontAmountInCentavos,
      1_234_567,
    );
    assert.equal(snapshot.remainingBalanceInCentavos, 0);
    assert.equal(
      snapshot.requiredUpfrontAmountInCentavos +
        snapshot.remainingBalanceInCentavos,
      snapshot.grossAmountInCentavos,
    );

    const refund = calculateRefundAmounts({
      originalPaidAmountInCentavos: 1_234_567,
      refundBasisPoints: 10_000,
      completedRefundAmountInCentavos: 0,
      reservedRefundAmountInCentavos: 0,
      frozenStage: "preparation_not_started",
    });

    assert.equal(
      refund.eligibleRefundAmountInCentavos,
      1_234_567,
    );
    assert.ok(
      refund.eligibleRefundAmountInCentavos <=
        refund.originalPaidAmountInCentavos,
    );

    const partial = calculateRefundAmounts({
      originalPaidAmountInCentavos: 1_234_567,
      refundBasisPoints: 5_000,
      completedRefundAmountInCentavos: 0,
      reservedRefundAmountInCentavos: 0,
      frozenStage: "preparation_not_started",
    });

    assert.equal(
      partial.eligibleRefundAmountInCentavos,
      617_284,
    );
    assert.ok(
      partial.eligibleRefundAmountInCentavos <
        partial.originalPaidAmountInCentavos,
    );
    assert.throws(() => calculateRefundAmounts({
      originalPaidAmountInCentavos: 1_234_567,
      refundBasisPoints: 10_000,
      completedRefundAmountInCentavos: 1_234_568,
      reservedRefundAmountInCentavos: 0,
      frozenStage: "preparation_not_started",
    }));
  },
);

test(
  "P13-G negative remaining balance is rejected",
  () => {
    assert.throws(
      () => snapshotFor({
        amount: 20_000,
        downPaymentAmount: 20_000,
        remainingBalance: -1,
        packagePaymentTerms: fullPaymentTerms,
      }),
      {code: "failed-precondition"},
    );
  },
);
