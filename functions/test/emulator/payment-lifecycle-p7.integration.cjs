const assert = require("node:assert/strict");
const path = require("node:path");

const {
  initializeApp,
  deleteApp,
} = require("firebase-admin/app");

const {
  getFirestore,
} = require("firebase-admin/firestore");

const projectId =
  process.env.GCLOUD_PROJECT ??
  "demo-feasta-phase3";

const app =
  initializeApp({projectId});

const db =
  getFirestore(app);

const libRoot =
  process.env.FEASTA_FUNCTIONS_LIB_DIR ??
  path.resolve(__dirname, "../../lib");

const CUSTOMER_ID =
  "customer-p7-lifecycle";

const GROSS =
  2_700_000;

const UPFRONT =
  1_350_000;

const BALANCE =
  GROSS - UPFRONT;

(async () => {
  const {
    createPaymentSessionForCustomer,
  } = require(path.join(
    libRoot,
    "payments/create-payment-session.js",
  ));

  const {
    processPayMongoWebhook,
  } = require(path.join(
    libRoot,
    "payments/process-webhook.js",
  ));

  const {
    paymentIdForProviderRequestChoice,
  } = require(path.join(
    libRoot,
    "payments/payment-obligation.js",
  ));

  const input = {
    createPaymentSessionForCustomer,
    processPayMongoWebhook,
    paymentIdForProviderRequestChoice,
  };

  try {
    await checkoutDoesNotConfirm(input);

    await initialPaid(
      input,
      "minimum",
      "minimum-paid",
    );

    await initialPaid(
      input,
      "full",
      "full-paid",
    );

    await initialUnsuccessful(
      input,
      "minimum",
      "failed",
      "minimum-failed",
    );

    await initialUnsuccessful(
      input,
      "full",
      "expired",
      "full-expired",
    );

    await balancePaid(input);

    await balanceUnsuccessful(
      input,
      "failed",
      "balance-failed",
    );

    await balanceUnsuccessful(
      input,
      "expired",
      "balance-expired",
    );

    await gatewayFactValidation(input);
    await canonicalLinkageValidation(input);

    console.log(
      "P7 payment lifecycle emulator integration passed.",
    );
  }
  finally {
    await deleteApp(app);
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function checkoutDoesNotConfirm(input) {
  const fixture =
    await seed("checkout-only");

  const result =
    await checkout(
      input,
      fixture,
      "minimum",
      "initial",
    );

  const payment =
    await readPayment(
      result.paymentId,
    );

  const request =
    await readRequest(
      fixture.requestId,
    );

  const event =
    await readEvent(
      fixture.eventId,
    );

  assert.equal(
    payment.status,
    "processing",
  );

  assert.equal(
    payment.paidAt ?? null,
    null,
  );

  assert.equal(
    request.status,
    "payment_processing",
  );

  assert.equal(
    request.paymentStatus,
    "processing",
  );

  assert.notEqual(
    event.status,
    "confirmed",
    "checkout creation or redirect alone cannot confirm payment",
  );
}

async function initialPaid(
  input,
  choice,
  suffix,
) {
  const fixture =
    await seed(suffix);

  const result =
    await checkout(
      input,
      fixture,
      choice,
      "initial",
    );

  const current =
    await attempt(
      result.paymentId,
    );

  const amount =
    choice === "full"
      ? GROSS
      : UPFRONT;

  const raw =
    paymentEvent({
      eventId:
        `evt_p7_${safe(suffix)}_paid`,

      paymentId:
        result.paymentId,

      attemptId:
        current.id,

      amount,

      status:
        "paid",
    });

  assert.deepEqual(
    await input.processPayMongoWebhook(raw),
    {
      duplicate: false,
      applied: true,
    },
  );

  const payment =
    await readPayment(
      result.paymentId,
    );

  const request =
    await readRequest(
      fixture.requestId,
    );

  const event =
    await readEvent(
      fixture.eventId,
    );

  assert.equal(
    payment.status,
    "paid",
  );

  assert.equal(
    payment.paymentChoice,
    choice,
  );

  assert.equal(
    request.status,
    "confirmed",
  );

  assert.equal(
    request.paymentStatus,
    "paid",
  );

  assert.equal(
    event.status,
    "confirmed",
  );

  if (choice === "minimum") {
    assert.equal(
      request.settlementStatus,
      "deposit_settled",
    );

    assert.equal(
      request.grossSettledAmountInCentavos,
      UPFRONT,
    );

    assert.equal(
      request.outstandingAmountInCentavos,
      BALANCE,
    );
  }
  else {
    assert.equal(
      request.settlementStatus,
      "fully_settled",
    );

    assert.equal(
      request.grossSettledAmountInCentavos,
      GROSS,
    );

    assert.equal(
      request.outstandingAmountInCentavos,
      0,
    );
  }

  const timeline =
    await timelineFor(
      fixture.eventId,
      result.paymentId,
    );

  assert.equal(
    timeline.length,
    1,
  );

  assert.equal(
    timeline[0].paymentChoice,
    choice,
  );

  assert.equal(
    timeline[0].paymentStatus,
    "paid",
  );

  assert.match(
    timeline[0].message,
    choice === "full"
      ? /full payment/u
      : /minimum payment/u,
  );

  const notificationRecords =
    await notificationsFor(
      result.paymentId,
    );

  const titles =
    new Set(
      notificationRecords.map(
        (item) => item.title,
      ),
    );

  assert.equal(
    titles.has(
      choice === "full"
        ? "Full payment confirmed"
        : "Minimum payment confirmed",
    ),
    true,
  );

  assert.equal(
    titles.has(
      choice === "full"
        ? "Full payment received"
        : "Minimum payment received",
    ),
    true,
  );

  const timelineCount =
    timeline.length;

  const notificationCount =
    notificationRecords.length;

  assert.deepEqual(
    await input.processPayMongoWebhook(raw),
    {
      duplicate: true,
      applied: false,
      reason:
        "webhook_already_processed",
    },
  );

  assert.equal(
    (
      await timelineFor(
        fixture.eventId,
        result.paymentId,
      )
    ).length,
    timelineCount,
    "replay must not duplicate timeline records",
  );

  assert.equal(
    (
      await notificationsFor(
        result.paymentId,
      )
    ).length,
    notificationCount,
    "replay must not duplicate notifications",
  );
}

async function initialUnsuccessful(
  input,
  choice,
  outcome,
  suffix,
) {
  const fixture =
    await seed(suffix);

  const result =
    await checkout(
      input,
      fixture,
      choice,
      "initial",
    );

  const current =
    await attempt(
      result.paymentId,
    );

  const amount =
    choice === "full"
      ? GROSS
      : UPFRONT;

  const raw =
    unsuccessfulEvent({
      eventId:
        `evt_p7_${safe(suffix)}_${outcome}`,

      paymentId:
        result.paymentId,

      attemptId:
        current.id,

      checkoutId:
        current.data.paymongoCheckoutId,

      amount,

      outcome,
    });

  assert.deepEqual(
    await input.processPayMongoWebhook(raw),
    {
      duplicate: false,
      applied: true,
    },
  );

  let payment =
    await readPayment(
      result.paymentId,
    );

  let request =
    await readRequest(
      fixture.requestId,
    );

  let event =
    await readEvent(
      fixture.eventId,
    );

  assert.equal(
    payment.status,
    outcome,
  );

  assert.equal(
    request.status,
    "waiting_for_down_payment",
  );

  assert.equal(
    request.paymentStatus,
    outcome,
  );

  assert.equal(
    request.settlementStatus,
    "unpaid",
  );

  assert.equal(
    request.grossSettledAmountInCentavos,
    0,
  );

  assert.equal(
    request.outstandingAmountInCentavos,
    GROSS,
  );

  assert.equal(
    event.status,
    "waiting_for_down_payment",
  );

  const attemptsBefore =
    await attemptCount(
      result.paymentId,
    );

  const sameAttemptRetry =
    await checkout(
      input,
      fixture,
      choice,
      "retry-without-terminal-proof",
    );

  assert.equal(
    sameAttemptRetry.paymentId,
    result.paymentId,
    "non-terminal failure evidence must preserve logical payment identity",
  );

  assert.equal(
    sameAttemptRetry.checkoutUrl,
    result.checkoutUrl,
    "non-terminal failure evidence must reuse the same checkout session",
  );

  assert.equal(
    await attemptCount(
      result.paymentId,
    ),
    attemptsBefore,
    "non-terminal failure evidence must not create a new checkout attempt",
  );

  payment =
    await readPayment(
      result.paymentId,
    );

  request =
    await readRequest(
      fixture.requestId,
    );

  event =
    await readEvent(
      fixture.eventId,
    );

  assert.equal(
    payment.status,
    "processing",
  );

  assert.equal(
    request.status,
    "payment_processing",
  );

  assert.equal(
    request.paymentStatus,
    "processing",
  );

  assert.equal(
    event.status,
    "waiting_for_down_payment",
    "the parent event remains in the aggregate payment-required lifecycle",
  );

  assert.equal(
    request.settlementStatus,
    "initial_payment_processing",
    "reusing an initial checkout must restore its financial processing state",
  );

  await addTerminalProof(
    result.paymentId,
    outcome,
  );

  const retry =
    await checkout(
      input,
      fixture,
      choice,
      "retry-with-terminal-proof",
    );

  assert.equal(
    retry.paymentId,
    result.paymentId,
    "retry must preserve logical payment identity",
  );

  assert.equal(
    await attemptCount(
      result.paymentId,
    ),
    attemptsBefore + 1,
  );

  payment =
    await readPayment(
      result.paymentId,
    );

  request =
    await readRequest(
      fixture.requestId,
    );

  event =
    await readEvent(
      fixture.eventId,
    );

  assert.equal(
    payment.status,
    "processing",
  );

  assert.equal(
    request.status,
    "payment_processing",
  );

  assert.equal(
    request.paymentStatus,
    "processing",
  );

  assert.equal(
    event.status,
    "waiting_for_down_payment",
    "the parent event remains in the aggregate payment-required lifecycle",
  );
}

async function balancePaid(input) {
  const fixture =
    await settledMinimum(
      input,
      "balance-paid",
    );

  const result =
    await checkout(
      input,
      fixture,
      "remaining_balance",
      "balance",
    );

  assert.equal(
    result.paymentId,
    input.paymentIdForProviderRequestChoice(
      fixture.requestId,
      "remaining_balance",
    ),
  );

  let request =
    await readRequest(
      fixture.requestId,
    );

  let event =
    await readEvent(
      fixture.eventId,
    );

  assert.equal(
    request.status,
    "confirmed",
  );

  assert.equal(
    event.status,
    "confirmed",
  );

  assert.equal(
    request.settlementStatus,
    "balance_payment_processing",
  );

  const current =
    await attempt(
      result.paymentId,
    );

  const raw =
    paymentEvent({
      eventId:
        "evt_p7_balance_paid",

      paymentId:
        result.paymentId,

      attemptId:
        current.id,

      amount:
        BALANCE,

      status:
        "paid",
    });

  assert.deepEqual(
    await input.processPayMongoWebhook(raw),
    {
      duplicate: false,
      applied: true,
    },
  );

  const payment =
    await readPayment(
      result.paymentId,
    );

  request =
    await readRequest(
      fixture.requestId,
    );

  event =
    await readEvent(
      fixture.eventId,
    );

  assert.equal(
    payment.status,
    "paid",
  );

  assert.equal(
    request.status,
    "confirmed",
    "balance settlement must not reopen provider lifecycle",
  );

  assert.equal(
    event.status,
    "confirmed",
    "balance settlement must preserve confirmed event",
  );

  assert.equal(
    request.settlementStatus,
    "fully_settled",
  );

  assert.equal(
    request.grossSettledAmountInCentavos,
    GROSS,
  );

  assert.equal(
    request.outstandingAmountInCentavos,
    0,
  );

  const timeline =
    await timelineFor(
      fixture.eventId,
      result.paymentId,
    );

  assert.equal(
    timeline.length,
    1,
  );

  assert.equal(
    timeline[0].paymentChoice,
    "remaining_balance",
  );

  assert.match(
    timeline[0].message,
    /remaining balance payment/u,
  );

  const notifications =
    await notificationsFor(
      result.paymentId,
    );

  const titles =
    new Set(
      notifications.map(
        (item) => item.title,
      ),
    );

  assert.equal(
    titles.has(
      "Remaining balance paid",
    ),
    true,
  );

  assert.equal(
    titles.has(
      "Remaining balance received",
    ),
    true,
  );

  const notificationCount =
    notifications.length;

  assert.deepEqual(
    await input.processPayMongoWebhook(raw),
    {
      duplicate: true,
      applied: false,
      reason:
        "webhook_already_processed",
    },
  );

  assert.equal(
    (
      await timelineFor(
        fixture.eventId,
        result.paymentId,
      )
    ).length,
    1,
  );

  assert.equal(
    (
      await notificationsFor(
        result.paymentId,
      )
    ).length,
    notificationCount,
  );
}

async function balanceUnsuccessful(
  input,
  outcome,
  suffix,
) {
  const fixture =
    await settledMinimum(
      input,
      suffix,
    );

  const result =
    await checkout(
      input,
      fixture,
      "remaining_balance",
      "balance",
    );

  const current =
    await attempt(
      result.paymentId,
    );

  const raw =
    unsuccessfulEvent({
      eventId:
        `evt_p7_${safe(suffix)}_${outcome}`,

      paymentId:
        result.paymentId,

      attemptId:
        current.id,

      checkoutId:
        current.data.paymongoCheckoutId,

      amount:
        BALANCE,

      outcome,
    });

  assert.deepEqual(
    await input.processPayMongoWebhook(raw),
    {
      duplicate: false,
      applied: true,
    },
  );

  let payment =
    await readPayment(
      result.paymentId,
    );

  let request =
    await readRequest(
      fixture.requestId,
    );

  let event =
    await readEvent(
      fixture.eventId,
    );

  assert.equal(
    payment.status,
    outcome,
  );

  assert.equal(
    request.status,
    "confirmed",
    "failed/expired balance must not reopen provider lifecycle",
  );

  assert.equal(
    event.status,
    "confirmed",
    "failed/expired balance must not reopen main event",
  );

  assert.equal(
    request.paymentStatus,
    outcome,
  );

  assert.equal(
    request.settlementStatus,
    "deposit_settled",
  );

  assert.equal(
    request.grossSettledAmountInCentavos,
    UPFRONT,
  );

  assert.equal(
    request.outstandingAmountInCentavos,
    BALANCE,
  );

  const attemptsBefore =
    await attemptCount(
      result.paymentId,
    );

  const sameAttemptRetry =
    await checkout(
      input,
      fixture,
      "remaining_balance",
      "balance-retry-without-terminal-proof",
    );

  assert.equal(
    sameAttemptRetry.paymentId,
    result.paymentId,
    "balance retry must preserve logical payment identity",
  );

  assert.equal(
    sameAttemptRetry.checkoutUrl,
    result.checkoutUrl,
    "non-terminal balance failure must reuse the existing checkout session",
  );

  assert.equal(
    await attemptCount(
      result.paymentId,
    ),
    attemptsBefore,
    "non-terminal balance failure must not create a new checkout attempt",
  );

  payment =
    await readPayment(
      result.paymentId,
    );

  request =
    await readRequest(
      fixture.requestId,
    );

  event =
    await readEvent(
      fixture.eventId,
    );

  assert.equal(
    payment.status,
    "processing",
  );

  assert.equal(
    request.status,
    "confirmed",
    "balance retry must preserve provider confirmation",
  );

  assert.equal(
    event.status,
    "confirmed",
    "balance retry must preserve confirmed event lifecycle",
  );

  assert.equal(
    request.settlementStatus,
    "balance_payment_processing",
  );

  await addTerminalProof(
    result.paymentId,
    outcome,
  );

  const retry =
    await checkout(
      input,
      fixture,
      "remaining_balance",
      "balance-retry-with-terminal-proof",
    );

  assert.equal(
    retry.paymentId,
    result.paymentId,
  );

  assert.equal(
    await attemptCount(
      result.paymentId,
    ),
    attemptsBefore + 1,
  );

  payment =
    await readPayment(
      result.paymentId,
    );

  request =
    await readRequest(
      fixture.requestId,
    );

  event =
    await readEvent(
      fixture.eventId,
    );

  assert.equal(
    payment.status,
    "processing",
  );

  assert.equal(
    request.status,
    "confirmed",
  );

  assert.equal(
    event.status,
    "confirmed",
  );

  assert.equal(
    request.settlementStatus,
    "balance_payment_processing",
  );
}

async function gatewayFactValidation(input) {
  const amountFixture =
    await seed("wrong-amount");

  const full =
    await checkout(
      input,
      amountFixture,
      "full",
      "initial",
    );

  const fullAttempt =
    await attempt(
      full.paymentId,
    );

  const amountResult =
    await input.processPayMongoWebhook(
      paymentEvent({
        eventId:
          "evt_p7_wrong_amount",

        paymentId:
          full.paymentId,

        attemptId:
          fullAttempt.id,

        amount:
          1,

        status:
          "paid",
      }),
    );

  assert.equal(
    amountResult.reason,
    "amount_mismatch",
  );

  assert.equal(
    (
      await readPayment(
        full.paymentId,
      )
    ).status,
    "processing",
  );

  const currencyFixture =
    await seed("wrong-currency");

  const minimum =
    await checkout(
      input,
      currencyFixture,
      "minimum",
      "initial",
    );

  const minimumAttempt =
    await attempt(
      minimum.paymentId,
    );

  const currencyResult =
    await input.processPayMongoWebhook(
      paymentEvent({
        eventId:
          "evt_p7_wrong_currency",

        paymentId:
          minimum.paymentId,

        attemptId:
          minimumAttempt.id,

        amount:
          UPFRONT,

        currency:
          "USD",

        status:
          "paid",
      }),
    );

  assert.equal(
    currencyResult.reason,
    "currency_mismatch",
  );

  assert.equal(
    (
      await readPayment(
        minimum.paymentId,
      )
    ).status,
    "processing",
  );
}

async function canonicalLinkageValidation(input) {
  const fixture =
    await seed("linkage");

  const result =
    await checkout(
      input,
      fixture,
      "minimum",
      "initial",
    );

  const current =
    await attempt(
      result.paymentId,
    );

  await db.doc(
    `providerRequests/${fixture.requestId}`,
  ).update({
    providerId:
      "provider-forged-p7-linkage",
  });

  const webhookResult =
    await input.processPayMongoWebhook(
      paymentEvent({
        eventId:
          "evt_p7_linkage_mismatch",

        paymentId:
          result.paymentId,

        attemptId:
          current.id,

        amount:
          UPFRONT,

        status:
          "paid",
      }),
    );

  assert.equal(
    webhookResult.reason,
    "canonical_linkage_mismatch",
  );

  assert.equal(
    (
      await readPayment(
        result.paymentId,
      )
    ).status,
    "processing",
  );
}

async function settledMinimum(
  input,
  suffix,
) {
  const fixture =
    await seed(suffix);

  const result =
    await checkout(
      input,
      fixture,
      "minimum",
      "minimum",
    );

  const current =
    await attempt(
      result.paymentId,
    );

  const applied =
    await input.processPayMongoWebhook(
      paymentEvent({
        eventId:
          `evt_p7_${safe(suffix)}_minimum_paid`,

        paymentId:
          result.paymentId,

        attemptId:
          current.id,

        amount:
          UPFRONT,

        status:
          "paid",
      }),
    );

  assert.equal(
    applied.applied,
    true,
  );

  assert.equal(
    (
      await readRequest(
        fixture.requestId,
      )
    ).settlementStatus,
    "deposit_settled",
  );

  assert.equal(
    (
      await readEvent(
        fixture.eventId,
      )
    ).status,
    "confirmed",
  );

  return fixture;
}

async function seed(suffix) {
  const id =
    safe(suffix);

  const eventId =
    `event-p7-${id}`;

  const requestId =
    `request-p7-${id}`;

  const providerId =
    `provider-p7-${id}`;

  const ownerId =
    `owner-p7-${id}`;

  const batch =
    db.batch();

  batch.set(
    db.doc(
      `mainEvents/${eventId}`,
    ),
    {
      mainEventId:
        eventId,

      bookingId:
        eventId,

      customerId:
        CUSTOMER_ID,

      providerRequestIds: [
        requestId,
      ],

      status:
        "waiting_for_down_payment",
    },
  );

  batch.set(
    db.doc(
      `providerRequests/${requestId}`,
    ),
    {
      providerRequestId:
        requestId,

      mainEventId:
        eventId,

      bookingId:
        eventId,

      customerId:
        CUSTOMER_ID,

      providerId,

      downPaymentAmount:
        UPFRONT / 100,

      financialSnapshot: {
        schemaVersion:
          1,

        currency:
          "PHP",

        grossAmountInCentavos:
          GROSS,

        requiredUpfrontAmountInCentavos:
          UPFRONT,

        remainingBalanceInCentavos:
          BALANCE,
      },

      status:
        "waiting_for_down_payment",

      paymentStatus:
        "unpaid",
    },
  );

  batch.set(
    db.doc(
      `providers/${providerId}`,
    ),
    {
      ownerId,

      verificationStatus:
        "approved",

      isActive:
        true,

      isSuspended:
        false,

      isDeleted:
        false,
    },
  );

  batch.set(
    db.doc(
      `users/${ownerId}`,
    ),
    {
      role:
        "provider",

      providerId,

      accountStatus:
        "active",

      isActive:
        true,

      isBlocked:
        false,
    },
  );

  await batch.commit();

  return {
    eventId,
    requestId,
  };
}

async function checkout(
  input,
  fixture,
  choice,
  attemptTag,
) {
  const checkoutId =
    "cs_p7_" +
    safe(fixture.requestId)
      .replaceAll("-", "_") +
    "_" +
    safe(attemptTag)
      .replaceAll("-", "_");

  return input
    .createPaymentSessionForCustomer({
      customerId:
        CUSTOMER_ID,

      providerRequestId:
        fixture.requestId,

      paymentChoice:
        choice,

      clientKey:
        `p7-${fixture.requestId}-${choice}-${attemptTag}`,

      secretKey:
        "stub-secret",

      successUrl:
        "https://example.test/success",

      cancelUrl:
        "https://example.test/cancel",

      createCheckout:
        async () => ({
          id:
            checkoutId,

          checkoutUrl:
            `https://checkout.paymongo.com/${checkoutId}`,
        }),
    });
}

function paymentEvent(input) {
  const id =
    safe(input.eventId)
      .replaceAll("-", "_");

  const attributes = {
    amount:
      input.amount,

    currency:
      input.currency ??
      "PHP",

    status:
      input.status,

    payment_intent_id:
      `pi_${id}`,

    metadata: {
      payment_id:
        input.paymentId,

      feasta_checkout_attempt_id:
        input.attemptId,
    },
  };

  if (input.status === "paid") {
    attributes.paid_at =
      1_700_000_001;
  }

  return Buffer.from(
    JSON.stringify({
      data: {
        id:
          input.eventId,

        type:
          "event",

        attributes: {
          type:
            input.status === "paid"
              ? "payment.paid"
              : "payment.failed",

          data: {
            id:
              `pay_${id}`,

            type:
              "payment",

            attributes,
          },
        },
      },
    }),
  );
}

function unsuccessfulEvent(input) {
  if (input.outcome === "failed") {
    return paymentEvent({
      eventId:
        input.eventId,

      paymentId:
        input.paymentId,

      attemptId:
        input.attemptId,

      amount:
        input.amount,

      status:
        "failed",
    });
  }

  return Buffer.from(
    JSON.stringify({
      data: {
        id:
          input.eventId,

        type:
          "event",

        attributes: {
          type:
            "checkout_session.expired",

          data: {
            id:
              input.checkoutId,

            type:
              "checkout_session",

            attributes: {
              amount:
                input.amount,

              currency:
                "PHP",

              metadata: {
                payment_id:
                  input.paymentId,

                feasta_checkout_attempt_id:
                  input.attemptId,
              },
            },
          },
        },
      },
    }),
  );
}

async function attempt(paymentId) {
  const payment =
    await readPayment(
      paymentId,
    );

  assert.equal(
    typeof payment.currentCheckoutAttemptId,
    "string",
  );

  const id =
    payment.currentCheckoutAttemptId;

  const snapshot =
    await db.doc(
      `payments/${paymentId}/checkoutAttempts/${id}`,
    ).get();

  assert.equal(
    snapshot.exists,
    true,
  );

  return {
    id,
    data:
      snapshot.data(),
  };
}

async function addTerminalProof(
  paymentId,
  outcome,
) {
  const current =
    await attempt(
      paymentId,
    );

  const data =
    current.data;

  const paymentIntentIds =
    Array.isArray(
      data.paymongoPaymentIntentIds,
    )
      ? data.paymongoPaymentIntentIds
      : [];

  const paymentIds =
    Array.isArray(
      data.paymongoPaymentIds,
    )
      ? data.paymongoPaymentIds
      : [];

  await db.doc(
    `payments/${paymentId}/checkoutAttempts/${current.id}`,
  ).update({
    resolution:
      outcome,

    terminalEvidence: {
      schemaVersion:
        1,

      authority:
        "paymongo",

      outcome:
        "terminal_unsuccessful",

      irreversible:
        true,

      exhaustive:
        true,

      evidenceReference:
        `p7-${outcome}-terminal-proof`,

      paymentId,

      attemptId:
        current.id,

      checkoutId:
        data.paymongoCheckoutId,

      paymentIntentIds,

      paymentIds,
    },
  });
}

async function attemptCount(paymentId) {
  return (
    await db.collection(
      `payments/${paymentId}/checkoutAttempts`,
    ).get()
  ).size;
}

async function timelineFor(
  eventId,
  paymentId,
) {
  const snapshot =
    await db.collection(
      `mainEvents/${eventId}/timeline`,
    ).get();

  return snapshot.docs
    .map(
      (document) =>
        document.data(),
    )
    .filter(
      (item) =>
        item.paymentId ===
        paymentId,
    );
}

async function notificationsFor(paymentId) {
  const snapshot =
    await db.collection(
      "notifications",
    ).get();

  return snapshot.docs
    .map(
      (document) =>
        document.data(),
    )
    .filter(
      (item) =>
        item.relatedId ===
        paymentId,
    );
}

async function readPayment(paymentId) {
  const snapshot =
    await db.doc(
      `payments/${paymentId}`,
    ).get();

  assert.equal(
    snapshot.exists,
    true,
  );

  return snapshot.data();
}

async function readRequest(requestId) {
  const snapshot =
    await db.doc(
      `providerRequests/${requestId}`,
    ).get();

  assert.equal(
    snapshot.exists,
    true,
  );

  return snapshot.data();
}

async function readEvent(eventId) {
  const snapshot =
    await db.doc(
      `mainEvents/${eventId}`,
    ).get();

  assert.equal(
    snapshot.exists,
    true,
  );

  return snapshot.data();
}

function safe(value) {
  return String(value)
    .toLowerCase()
    .replace(
      /[^a-z0-9_-]/gu,
      "_",
    );
}