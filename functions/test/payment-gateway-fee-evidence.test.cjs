const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const test =
  require("node:test");

const {
  parsePayMongoPaymentEvent,
} =
  require(
    path.resolve(
      __dirname,
      "../lib/payments/payment-security.js",
    ),
  );

function directPaymentEvent(
  fee,
) {
  const attributes = {
    amount:
      100000,

    currency:
      "PHP",

    status:
      "paid",

    paid_at:
      1800000000,

    payment_intent_id:
      "pi_gateway_fee",

    metadata: {
      payment_id:
        "payment_gateway_fee",
    },
  };

  if (fee !== undefined) {
    attributes.fee = fee;
  }

  return Buffer.from(
    JSON.stringify({
      data: {
        id:
          "evt_gateway_fee",

        type:
          "event",

        attributes: {
          type:
            "payment.paid",

          data: {
            id:
              "pay_gateway_fee",

            type:
              "payment",

            attributes,
          },
        },
      },
    }),
  );
}

function checkoutPaymentEvent(
  fee,
) {
  const paymentAttributes = {
    amount:
      100000,

    currency:
      "PHP",

    status:
      "paid",

    paid_at:
      1800000000,

    payment_intent_id:
      "pi_checkout_gateway_fee",
  };

  if (fee !== undefined) {
    paymentAttributes.fee = fee;
  }

  return Buffer.from(
    JSON.stringify({
      data: {
        id:
          "evt_checkout_gateway_fee",

        type:
          "event",

        attributes: {
          type:
            "checkout_session.payment.paid",

          data: {
            id:
              "cs_gateway_fee",

            type:
              "checkout_session",

            attributes: {
              metadata: {
                payment_id:
                  "payment_checkout_gateway_fee",
              },

              payments: [
                {
                  id:
                    "pay_checkout_gateway_fee",

                  type:
                    "payment",

                  attributes:
                    paymentAttributes,
                },
              ],
            },
          },
        },
      },
    }),
  );
}

test(
  "direct PayMongo payment preserves observed gateway fee",
  () => {
    const event =
      parsePayMongoPaymentEvent(
        directPaymentEvent(
          3500,
        ),
      );

    assert.equal(
      event.gatewayFeeInCentavos,
      3500,
    );

    assert.equal(
      event.successfulPayments[0]
        .gatewayFeeInCentavos,
      3500,
    );
  },
);

test(
  "checkout payment preserves fee from the selected paid payment resource",
  () => {
    const event =
      parsePayMongoPaymentEvent(
        checkoutPaymentEvent(
          4200,
        ),
      );

    assert.equal(
      event.gatewayResourceId,
      "pay_checkout_gateway_fee",
    );

    assert.equal(
      event.gatewayFeeInCentavos,
      4200,
    );
  },
);

test(
  "missing gateway fee remains unknown instead of becoming zero",
  () => {
    const event =
      parsePayMongoPaymentEvent(
        directPaymentEvent(),
      );

    assert.equal(
      event.gatewayFeeInCentavos,
      null,
    );
  },
);

test(
  "zero gateway fee is preserved as observed zero evidence",
  () => {
    const event =
      parsePayMongoPaymentEvent(
        directPaymentEvent(
          0,
        ),
      );

    assert.equal(
      event.gatewayFeeInCentavos,
      0,
    );
  },
);

test(
  "invalid gateway fee evidence fails closed",
  () => {
    assert.throws(
      () =>
        parsePayMongoPaymentEvent(
          directPaymentEvent(
            -1,
          ),
        ),
      /Gateway payment fee is invalid/u,
    );

    assert.throws(
      () =>
        parsePayMongoPaymentEvent(
          directPaymentEvent(
            1.5,
          ),
        ),
      /Gateway payment fee is invalid/u,
    );
  },
);