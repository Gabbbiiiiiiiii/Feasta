const assert =
  require("node:assert/strict");

const test =
  require("node:test");

const {
  resolveServiceBookingPolicy,
} = require(
  "../lib/bookings/service-booking-policy.js",
);

const category = {
  name:
    "Photography",

  serviceType:
    "addon",

  status:
    "active",
};

for (const [source, hours] of [["category", 72], ["package", 96], ["platform", 120]]) {
  test(`${source} balance deadline override cannot change FEASTA T-24 or its policy hash`, () => {
    const input = {
      platformSettings: null,
      serviceCategoryCode: "photographer",
      serviceCategory: {...category, bookingPolicy: {payment: {}}},
      packageId: "package_123",
      packageData: {bookingPolicyOverride: {payment: {}}},
    };
    if (source === "platform") input.platformSettings = {serviceBookingPolicyDefaults: {payment: {}}};
    const baseline = resolveServiceBookingPolicy(input);
    const payment = source === "category" ? input.serviceCategory.bookingPolicy.payment :
      source === "package" ? input.packageData.bookingPolicyOverride.payment :
        input.platformSettings.serviceBookingPolicyDefaults.payment;
    payment.balanceDueHoursBeforeEvent = hours;
    const resolved = resolveServiceBookingPolicy(input);
    assert.equal(resolved.policy.payment.balanceDueHoursBeforeEvent, 24);
    assert.equal(resolved.effectivePolicyKey, baseline.effectivePolicyKey);
    assert.equal(payment.balanceDueHoursBeforeEvent, hours, "stored document is not mutated");
  });
}

test(
  "platform defaults produce the FEASTA baseline booking policy",
  () => {
    const resolved =
      resolveServiceBookingPolicy({
        platformSettings: null,

        serviceCategoryCode:
          "photographer",

        serviceCategory:
          category,
      });

    assert.equal(
      resolved.schemaVersion,
      1,
    );

    assert.equal(
      resolved.policy.payment
        .onlineOnly,
      true,
    );

    assert.equal(
      resolved.policy.payment
        .depositAllowed,
      true,
    );

    assert.equal(
      resolved.policy.payment
        .depositRateBps,
      5000,
    );

    assert.equal(
      resolved.policy.payment
        .depositMinimumNoticeHours,
      48,
    );

    assert.equal(
      resolved.policy.payment
        .balanceDueHoursBeforeEvent,
      24,
    );

    assert.equal(
      resolved.policy.preparation
        .leadTimeHours,
      72,
    );

    assert.equal(
      resolved.policy.sameDay
        .allowed,
      false,
    );

    assert.equal(
      resolved.policy.cancellation
        .beforePreparationRefundRateBps,
      10000,
    );

    assert.equal(
      resolved.policy.cancellation
        .duringPreparationRefundRateBps,
      5000,
    );

    assert.equal(
      resolved.policy.cancellation
        .noRefundHoursBeforeEvent,
      24,
    );

    assert.equal(
      resolved.policy.lifecycle
        .autoStartAtScheduledTime,
      true,
    );

    assert.equal(
      resolved.policy.lifecycle
        .providerConfirmsCompletion,
      true,
    );
  },
);

test(
  "service category overrides behavior without hardcoded category branching",
  () => {
    const resolved =
      resolveServiceBookingPolicy({
        platformSettings: null,

        serviceCategoryCode:
          "photographer",

        serviceCategory: {
          ...category,

          bookingPolicyVersion:
            4,

          bookingPolicy: {
            preparation: {
              leadTimeHours:
                24,
            },

            sameDay: {
              allowed:
                true,

              requiresManualApproval:
                true,
            },
          },
        },
      });

    assert.equal(
      resolved.policy.preparation
        .leadTimeHours,
      24,
    );

    assert.equal(
      resolved.policy.sameDay
        .allowed,
      true,
    );

    assert.equal(
      resolved.source
        .serviceCategoryPolicyVersion,
      4,
    );
  },
);

test(
  "package override can specialize the selected service policy",
  () => {
    const resolved =
      resolveServiceBookingPolicy({
        platformSettings: null,

        serviceCategoryCode:
          "catering_service",

        serviceCategory: {
          name:
            "Catering Service",

          serviceType:
            "catering",

          status:
            "active",
        },

        packageId:
          "package_123",

        packageData: {
          bookingPolicyVersion:
            2,

          bookingPolicyOverride: {
            preparation: {
              leadTimeHours:
                48,
            },
          },
        },
      });

    assert.equal(
      resolved.policy.preparation
        .leadTimeHours,
      48,
    );

    assert.equal(
      resolved.source.packageId,
      "package_123",
    );

    assert.equal(
      resolved.source
        .packagePolicyVersion,
      2,
    );
  },
);

test(
  "stored platform policy can change future booking behavior",
  () => {
    const resolved =
      resolveServiceBookingPolicy({
        platformSettings: {
          serviceBookingPolicyVersion:
            3,

          serviceBookingPolicyDefaults: {
            payment: {
              depositRateBps:
                6000,

              depositMinimumNoticeHours:
                72,

              balanceDueHoursBeforeEvent:
                24,
            },
          },
        },

        serviceCategoryCode:
          "event_coordinator",

        serviceCategory: {
          name:
            "Event Coordinator",

          serviceType:
            "addon",

          status:
            "active",
        },
      });

    assert.equal(
      resolved.policy.payment
        .depositRateBps,
      6000,
    );

    assert.equal(
      resolved.policy.payment
        .depositMinimumNoticeHours,
      72,
    );

    assert.equal(
      resolved.source
        .platformPolicyVersion,
      3,
    );
  },
);

test(
  "impossible deposit timing fails closed",
  () => {
    assert.throws(
      () =>
        resolveServiceBookingPolicy({
          platformSettings: {
            serviceBookingPolicyDefaults: {
              payment: {
                depositMinimumNoticeHours:
                  24,

                balanceDueHoursBeforeEvent:
                  24,
              },
            },
          },

          serviceCategoryCode:
            "photographer",

          serviceCategory:
            category,
        }),
      {
        code:
          "failed-precondition",
      },
    );
  },
);

test(
  "unknown policy fields fail closed",
  () => {
    assert.throws(
      () =>
        resolveServiceBookingPolicy({
          platformSettings: null,

          serviceCategoryCode:
            "photographer",

          serviceCategory: {
            ...category,

            bookingPolicy: {
              surpriseRule:
                true,
            },
          },
        }),
      {
        code:
          "failed-precondition",
      },
    );
  },
);

test(
  "effective policy key is stable and changes when policy changes",
  () => {
    const first =
      resolveServiceBookingPolicy({
        platformSettings: null,

        serviceCategoryCode:
          "photographer",

        serviceCategory:
          category,
      });

    const second =
      resolveServiceBookingPolicy({
        platformSettings: null,

        serviceCategoryCode:
          "photographer",

        serviceCategory:
          category,
      });

    const changed =
      resolveServiceBookingPolicy({
        platformSettings: null,

        serviceCategoryCode:
          "photographer",

        serviceCategory: {
          ...category,

          bookingPolicyVersion:
            2,

          bookingPolicy: {
            preparation: {
              leadTimeHours:
                48,
            },
          },
        },
      });

    assert.equal(
      first.effectivePolicyKey,
      second.effectivePolicyKey,
    );

    assert.notEqual(
      first.effectivePolicyKey,
      changed.effectivePolicyKey,
    );
  },
);
