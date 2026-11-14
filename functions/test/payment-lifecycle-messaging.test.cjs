const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const libRoot = process.env.FEASTA_FUNCTIONS_LIB_DIR ??
  path.resolve(__dirname, "../lib");

const {
  customerNotificationMessageForPaymentLifecycle,
  customerNotificationTitleForPaymentLifecycle,
  paymentLifecycleChoice,
  providerNotificationMessageForPaymentLifecycle,
  providerNotificationTitleForPaymentLifecycle,
  timelineMessageForPaymentLifecycle,
} = require(path.join(
  libRoot,
  "payments/payment-lifecycle-messaging.js",
));

test("only canonical payment choices are accepted", () => {
  assert.equal(paymentLifecycleChoice("minimum"), "minimum");
  assert.equal(paymentLifecycleChoice("full"), "full");
  assert.equal(
    paymentLifecycleChoice("remaining_balance"),
    "remaining_balance",
  );
  assert.equal(paymentLifecycleChoice("arbitrary"), null);
  assert.equal(paymentLifecycleChoice(undefined), null);
});

test("paid lifecycle copy distinguishes all P6 obligations", () => {
  assert.equal(
    timelineMessageForPaymentLifecycle("paid", "minimum"),
    "The minimum payment was successfully confirmed.",
  );

  assert.equal(
    timelineMessageForPaymentLifecycle("paid", "full"),
    "The full payment was successfully confirmed.",
  );

  assert.equal(
    timelineMessageForPaymentLifecycle(
      "paid",
      "remaining_balance",
    ),
    "The remaining balance payment was successfully confirmed.",
  );

  assert.equal(
    customerNotificationTitleForPaymentLifecycle(
      "paid",
      "minimum",
    ),
    "Minimum payment confirmed",
  );

  assert.equal(
    customerNotificationTitleForPaymentLifecycle(
      "paid",
      "full",
    ),
    "Full payment confirmed",
  );

  assert.equal(
    customerNotificationTitleForPaymentLifecycle(
      "paid",
      "remaining_balance",
    ),
    "Remaining balance paid",
  );

  assert.equal(
    providerNotificationTitleForPaymentLifecycle(
      "paid",
      "remaining_balance",
    ),
    "Remaining balance received",
  );
});

test("failed and expired lifecycle copy remains obligation-specific", () => {
  assert.equal(
    customerNotificationMessageForPaymentLifecycle(
      "failed",
      "minimum",
    ),
    "Your minimum payment failed. You may try again.",
  );

  assert.equal(
    customerNotificationMessageForPaymentLifecycle(
      "failed",
      "full",
    ),
    "Your full payment failed. You may try again.",
  );

  assert.equal(
    customerNotificationMessageForPaymentLifecycle(
      "expired",
      "remaining_balance",
    ),
    "Your remaining balance payment session expired. " +
      "You may create a new session.",
  );

  assert.equal(
    providerNotificationMessageForPaymentLifecycle(
      "failed",
      "remaining_balance",
    ),
    "The customer's remaining balance payment failed.",
  );
});

test("legacy payment records preserve historical generic copy", () => {
  assert.equal(
    timelineMessageForPaymentLifecycle(
      "paid",
      undefined,
    ),
    "The provider down payment was successfully confirmed.",
  );

  assert.equal(
    customerNotificationTitleForPaymentLifecycle(
      "paid",
      undefined,
    ),
    "Payment confirmed",
  );

  assert.equal(
    customerNotificationMessageForPaymentLifecycle(
      "paid",
      undefined,
    ),
    "Your provider payment was securely confirmed.",
  );

  assert.equal(
    providerNotificationTitleForPaymentLifecycle(
      "paid",
      undefined,
    ),
    "Payment received",
  );

  assert.equal(
    providerNotificationMessageForPaymentLifecycle(
      "paid",
      undefined,
    ),
    "A payment for your provider request was confirmed.",
  );
});