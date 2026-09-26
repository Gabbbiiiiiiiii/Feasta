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
  paymentIdForProviderRequestChoice,
  providerPaymentObligationForChoice,
} =
  require(path.join(
    libRoot,
    "payments/payment-obligation.js",
  ));

const {
  initialPaymentReservationSettlementUpdate,
  providerRequestSettlementUpdateForPaymentOutcome,
  resolveProviderRequestSettlement,
} =
  require(path.join(
    libRoot,
    "payments/payment-settlement.js",
  ));

const PROVIDER_REQUEST_ID =
  "provider_request_settlement_001";

function baseRequest() {
  return {
    providerRequestId:
      PROVIDER_REQUEST_ID,

    downPaymentAmount:
      9000,

    financialSnapshot: {
      schemaVersion: 1,
      currency: "PHP",

      grossAmountInCentavos:
        3000000,

      requiredUpfrontAmountInCentavos:
        900000,

      remainingBalanceInCentavos:
        2100000,
    },

    initialPaymentChoice:
      null,

    initialPaymentId:
      null,

    remainingBalancePaymentId:
      null,

    paymentId:
      null,
  };
}

function selectedRequest(
  paymentChoice,
) {
  const request =
    baseRequest();

  const initialPaymentId =
    paymentIdForProviderRequestChoice(
      PROVIDER_REQUEST_ID,
      paymentChoice,
    );

  return {
    ...request,

    initialPaymentChoice:
      paymentChoice,

    initialPaymentId,

    paymentId:
      initialPaymentId,
  };
}

function withBalancePointer(
  request,
) {
  const balancePaymentId =
    paymentIdForProviderRequestChoice(
      PROVIDER_REQUEST_ID,
      "remaining_balance",
    );

  return {
    ...request,

    remainingBalancePaymentId:
      balancePaymentId,

    /*
     * Compatibility/current-attempt pointer may move.
     * initialPaymentId remains immutable.
     */
    paymentId:
      balancePaymentId,
  };
}

function paymentFor(
  providerRequest,
  paymentChoice,
  status,
) {
  const paymentId =
    paymentIdForProviderRequestChoice(
      PROVIDER_REQUEST_ID,
      paymentChoice,
    );

  const obligation =
    providerPaymentObligationForChoice({
      financialSnapshot:
        providerRequest
          .financialSnapshot,

      paymentChoice,
    });

  assert.ok(
    obligation,
    `Expected ${paymentChoice} obligation`,
  );

  const settled =
    status === "paid" ||
    status === "partially_refunded" ||
    status === "refunded";

  return {
    id: paymentId,

    data: {
      paymentId,

      providerRequestId:
        PROVIDER_REQUEST_ID,

      obligationSchemaVersion:
        obligation.schemaVersion,

      paymentChoice:
        obligation.paymentChoice,

      obligationKey:
        obligation.obligationKey,

      obligationKind:
        obligation.obligationKind,

      paymentType:
        obligation.paymentType,

      amountInCentavos:
        obligation.amountInCentavos,

      currency: "PHP",

      status,

      paidAt:
        settled
          ? Timestamp.fromMillis(
              1700000000000,
            )
          : null,
    },
  };
}

test(
  "initial reservation persists a zero-settled authoritative snapshot",
  () => {
    const providerRequest =
      baseRequest();

    const timestamp =
      {kind: "server_timestamp"};

    const update =
      initialPaymentReservationSettlementUpdate({
        financialSnapshot:
          providerRequest
            .financialSnapshot,

        timestamp,
      });

    assert.deepEqual(
      update,
      {
        settlementSchemaVersion:
          1,

        settlementStatus:
          "initial_payment_processing",

        grossSettledAmountInCentavos:
          0,

        outstandingAmountInCentavos:
          3000000,

        remainingBalancePaymentId:
          null,

        settlementUpdatedAt:
          timestamp,
      },
    );
  },
);

test(
  "minimum paid projects deposit settlement without requiring balance",
  () => {
    const providerRequest =
      selectedRequest(
        "minimum",
      );

    const update =
      providerRequestSettlementUpdateForPaymentOutcome({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        paymentId:
          providerRequest
            .initialPaymentId,

        paymentStatus:
          "paid",

        timestamp:
          "paid-at",
      });

    assert.deepEqual(
      update,
      {
        settlementSchemaVersion:
          1,

        settlementStatus:
          "deposit_settled",

        grossSettledAmountInCentavos:
          900000,

        outstandingAmountInCentavos:
          2100000,

        settlementUpdatedAt:
          "paid-at",
      },
    );
  },
);

test(
  "full paid projects a fully settled provider request",
  () => {
    const providerRequest =
      selectedRequest(
        "full",
      );

    const update =
      providerRequestSettlementUpdateForPaymentOutcome({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        paymentId:
          providerRequest
            .initialPaymentId,

        paymentStatus:
          "paid",

        timestamp:
          "paid-at",
      });

    assert.equal(
      update.settlementStatus,
      "fully_settled",
    );

    assert.equal(
      update
        .grossSettledAmountInCentavos,
      3000000,
    );

    assert.equal(
      update
        .outstandingAmountInCentavos,
      0,
    );
  },
);

test(
  "failed initial payment does not create settlement",
  () => {
    const providerRequest =
      selectedRequest(
        "minimum",
      );

    const update =
      providerRequestSettlementUpdateForPaymentOutcome({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        paymentId:
          providerRequest
            .initialPaymentId,

        paymentStatus:
          "failed",

        timestamp:
          "failed-at",
      });

    assert.equal(
      update.settlementStatus,
      "unpaid",
    );

    assert.equal(
      update
        .grossSettledAmountInCentavos,
      0,
    );

    assert.equal(
      update
        .outstandingAmountInCentavos,
      3000000,
    );
  },
);

test(
  "balance processing preserves settled deposit and only changes financial lifecycle",
  () => {
    const providerRequest =
      withBalancePointer(
        selectedRequest(
          "minimum",
        ),
      );

    const update =
      providerRequestSettlementUpdateForPaymentOutcome({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        paymentId:
          providerRequest
            .remainingBalancePaymentId,

        paymentStatus:
          "processing",

        timestamp:
          "balance-processing-at",
      });

    assert.equal(
      update.settlementStatus,
      "balance_payment_processing",
    );

    assert.equal(
      update
        .grossSettledAmountInCentavos,
      900000,
    );

    assert.equal(
      update
        .outstandingAmountInCentavos,
      2100000,
    );
  },
);

test(
  "failed balance payment leaves deposit settlement intact",
  () => {
    const providerRequest =
      withBalancePointer(
        selectedRequest(
          "minimum",
        ),
      );

    const update =
      providerRequestSettlementUpdateForPaymentOutcome({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        paymentId:
          providerRequest
            .remainingBalancePaymentId,

        paymentStatus:
          "failed",

        timestamp:
          "balance-failed-at",
      });

    assert.equal(
      update.settlementStatus,
      "deposit_settled",
    );

    assert.equal(
      update
        .grossSettledAmountInCentavos,
      900000,
    );

    assert.equal(
      update
        .outstandingAmountInCentavos,
      2100000,
    );
  },
);

test(
  "paid balance settles the full immutable gross amount",
  () => {
    const providerRequest =
      withBalancePointer(
        selectedRequest(
          "minimum",
        ),
      );

    const update =
      providerRequestSettlementUpdateForPaymentOutcome({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        paymentId:
          providerRequest
            .remainingBalancePaymentId,

        paymentStatus:
          "paid",

        timestamp:
          "balance-paid-at",
      });

    assert.equal(
      update.settlementStatus,
      "fully_settled",
    );

    assert.equal(
      update
        .grossSettledAmountInCentavos,
      3000000,
    );

    assert.equal(
      update
        .outstandingAmountInCentavos,
      0,
    );
  },
);

test(
  "refund outcome preserves historical settlement",
  () => {
    const providerRequest =
      selectedRequest(
        "full",
      );

    const update =
      providerRequestSettlementUpdateForPaymentOutcome({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        paymentId:
          providerRequest
            .initialPaymentId,

        paymentStatus:
          "refunded",

        timestamp:
          "refunded-at",
      });

    assert.equal(
      update.settlementStatus,
      "fully_settled",
    );

    assert.equal(
      update
        .grossSettledAmountInCentavos,
      3000000,
    );

    assert.equal(
      update
        .outstandingAmountInCentavos,
      0,
    );
  },
);

test(
  "settlement outcome rejects a payment outside the known obligations",
  () => {
    const providerRequest =
      selectedRequest(
        "minimum",
      );

    assert.throws(
      () =>
        providerRequestSettlementUpdateForPaymentOutcome({
          providerRequestId:
            PROVIDER_REQUEST_ID,

          providerRequest,

          paymentId:
            "payment_forged",

          paymentStatus:
            "paid",

          timestamp:
            "forged-at",
        }),

      /settlement is invalid/u,
    );
  },
);

test(
  "full-payment selection can never attach a balance payment",
  () => {
    const providerRequest = {
      ...selectedRequest(
        "full",
      ),

      remainingBalancePaymentId:
        paymentIdForProviderRequestChoice(
          PROVIDER_REQUEST_ID,
          "remaining_balance",
        ),
    };

    assert.throws(
      () =>
        providerRequestSettlementUpdateForPaymentOutcome({
          providerRequestId:
            PROVIDER_REQUEST_ID,

          providerRequest,

          paymentId:
            providerRequest
              .remainingBalancePaymentId,

          paymentStatus:
            "paid",

          timestamp:
            "invalid-balance-at",
        }),

      /settlement is invalid/u,
    );
  },
);

test(
  "no reserved P5 payment is unpaid",
  () => {
    const settlement =
      resolveProviderRequestSettlement({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest:
          baseRequest(),

        payments: [],
      });

    assert.equal(
      settlement.status,
      "unpaid",
    );

    assert.equal(
      settlement
        .grossSettledAmountInCentavos,
      0,
    );

    assert.equal(
      settlement
        .outstandingAmountInCentavos,
      3000000,
    );

    assert.equal(
      settlement.fullySettled,
      false,
    );
  },
);

test(
  "minimum settlement preserves the remaining balance",
  () => {
    const providerRequest =
      selectedRequest(
        "minimum",
      );

    const minimum =
      paymentFor(
        providerRequest,
        "minimum",
        "paid",
      );

    const settlement =
      resolveProviderRequestSettlement({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        payments: [
          minimum,
        ],
      });

    assert.equal(
      settlement.status,
      "deposit_settled",
    );

    assert.equal(
      settlement
        .grossSettledAmountInCentavos,
      900000,
    );

    assert.equal(
      settlement
        .outstandingAmountInCentavos,
      2100000,
    );

    assert.deepEqual(
      settlement.settledPaymentIds,
      [minimum.id],
    );
  },
);

test(
  "minimum plus remaining balance settles the full gross amount",
  () => {
    let providerRequest =
      selectedRequest(
        "minimum",
      );

    providerRequest =
      withBalancePointer(
        providerRequest,
      );

    const minimum =
      paymentFor(
        providerRequest,
        "minimum",
        "paid",
      );

    const balance =
      paymentFor(
        providerRequest,
        "remaining_balance",
        "paid",
      );

    const settlement =
      resolveProviderRequestSettlement({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        payments: [
          minimum,
          balance,
        ],
      });

    assert.equal(
      settlement.status,
      "fully_settled",
    );

    assert.equal(
      settlement
        .grossSettledAmountInCentavos,
      3000000,
    );

    assert.equal(
      settlement
        .outstandingAmountInCentavos,
      0,
    );

    assert.equal(
      settlement.fullySettled,
      true,
    );

    assert.equal(
      settlement.initialPaymentId,
      minimum.id,
    );

    assert.equal(
      settlement
        .remainingBalancePaymentId,
      balance.id,
    );
  },
);

test(
  "full initial payment settles the entire obligation",
  () => {
    const providerRequest =
      selectedRequest(
        "full",
      );

    const full =
      paymentFor(
        providerRequest,
        "full",
        "paid",
      );

    const settlement =
      resolveProviderRequestSettlement({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        payments: [
          full,
        ],
      });

    assert.equal(
      settlement.status,
      "fully_settled",
    );

    assert.equal(
      settlement
        .grossSettledAmountInCentavos,
      3000000,
    );

    assert.equal(
      settlement
        .outstandingAmountInCentavos,
      0,
    );
  },
);

test(
  "balance processing does not move or replace initial settlement authority",
  () => {
    let providerRequest =
      selectedRequest(
        "minimum",
      );

    const initialPaymentId =
      providerRequest
        .initialPaymentId;

    providerRequest =
      withBalancePointer(
        providerRequest,
      );

    const minimum =
      paymentFor(
        providerRequest,
        "minimum",
        "paid",
      );

    const balance =
      paymentFor(
        providerRequest,
        "remaining_balance",
        "processing",
      );

    const settlement =
      resolveProviderRequestSettlement({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        payments: [
          minimum,
          balance,
        ],
      });

    assert.equal(
      settlement.status,
      "balance_payment_processing",
    );

    assert.equal(
      settlement.initialPaymentId,
      initialPaymentId,
    );

    assert.equal(
      settlement
        .grossSettledAmountInCentavos,
      900000,
    );

    assert.equal(
      settlement
        .outstandingAmountInCentavos,
      2100000,
    );
  },
);

test(
  "refund history does not reopen a settled payment obligation",
  () => {
    const providerRequest =
      selectedRequest(
        "full",
      );

    const refunded =
      paymentFor(
        providerRequest,
        "full",
        "refunded",
      );

    const settlement =
      resolveProviderRequestSettlement({
        providerRequestId:
          PROVIDER_REQUEST_ID,

        providerRequest,

        payments: [
          refunded,
        ],
      });

    assert.equal(
      settlement.status,
      "fully_settled",
    );

    assert.equal(
      settlement
        .grossSettledAmountInCentavos,
      3000000,
    );

    assert.equal(
      settlement
        .outstandingAmountInCentavos,
      0,
    );
  },
);

test(
  "minimum and full payment documents cannot coexist",
  () => {
    const providerRequest =
      selectedRequest(
        "minimum",
      );

    assert.throws(
      () =>
        resolveProviderRequestSettlement({
          providerRequestId:
            PROVIDER_REQUEST_ID,

          providerRequest,

          payments: [
            paymentFor(
              providerRequest,
              "minimum",
              "paid",
            ),

            paymentFor(
              providerRequest,
              "full",
              "paid",
            ),
          ],
        }),

      /settlement is invalid/u,
    );
  },
);

test(
  "remaining balance cannot settle before the minimum payment",
  () => {
    let providerRequest =
      selectedRequest(
        "minimum",
      );

    providerRequest =
      withBalancePointer(
        providerRequest,
      );

    assert.throws(
      () =>
        resolveProviderRequestSettlement({
          providerRequestId:
            PROVIDER_REQUEST_ID,

          providerRequest,

          payments: [
            paymentFor(
              providerRequest,
              "minimum",
              "processing",
            ),

            paymentFor(
              providerRequest,
              "remaining_balance",
              "paid",
            ),
          ],
        }),

      /settlement is invalid/u,
    );
  },
);

test(
  "forged obligation money fails closed",
  () => {
    const providerRequest =
      selectedRequest(
        "minimum",
      );

    const minimum =
      paymentFor(
        providerRequest,
        "minimum",
        "paid",
      );

    minimum.data =
      {
        ...minimum.data,
        amountInCentavos: 1,
      };

    assert.throws(
      () =>
        resolveProviderRequestSettlement({
          providerRequestId:
            PROVIDER_REQUEST_ID,

          providerRequest,

          payments: [
            minimum,
          ],
        }),

      /settlement is invalid/u,
    );
  },
);

test(
  "balance pointer must use the deterministic balance identity",
  () => {
    const providerRequest = {
      ...selectedRequest(
        "minimum",
      ),

      remainingBalancePaymentId:
        "forged-balance-payment",
    };

    assert.throws(
      () =>
        resolveProviderRequestSettlement({
          providerRequestId:
            PROVIDER_REQUEST_ID,

          providerRequest,

          payments: [
            paymentFor(
              providerRequest,
              "minimum",
              "paid",
            ),
          ],
        }),

      /settlement is invalid/u,
    );
  },
);
