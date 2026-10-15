const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const path =
  require("node:path");

const {
  remainingBalanceLifecyclePlan,
  remainingBalanceNotificationId,
} = require(path.join(
  __dirname,
  "..",
  "lib",
  "payments",
  "remaining-balance-lifecycle-domain.js",
));

function timestamp(
  value,
) {
  return {
    toDate() {
      return new Date(value);
    },
  };
}

function request(
  overrides = {},
) {
  return {
    status:
      "confirmed",

    settlementStatus:
      "deposit_settled",

    outstandingAmountInCentavos:
      70000,

    remainingBalanceTimingSchemaVersion:
      1,

    remainingBalanceStatus:
      "not_due",

    eventDate:
      timestamp(
        "2026-10-20T00:00:00+08:00",
      ),

    balanceDueDaysBeforeEvent:
      7,

    remainingBalanceDueSoonWindowDays:
      3,

    remainingBalanceGracePeriodDays:
      2,

    remainingBalanceDueAt:
      timestamp(
        "2026-10-13T00:00:00+08:00",
      ),

    remainingBalanceGraceEndsAt:
      timestamp(
        "2026-10-16T00:00:00+08:00",
      ),

    financialSnapshot: {
      schemaVersion:
        1,

      currency:
        "PHP",

      remainingBalanceInCentavos:
        70000,
    },

    ...overrides,
  };
}

test(
  "due-soon transition creates deterministic reminder",
  () => {
    const plan =
      remainingBalanceLifecyclePlan({
        providerRequestId:
          "provider_request_123",

        providerRequest:
          request(),

        now:
          new Date(
            "2026-10-10T00:00:00+08:00",
          ),
      });

    assert.ok(plan);

    assert.equal(
      plan.nextStatus,
      "due_soon",
    );

    assert.equal(
      plan.reminder?.stage,
      "due_soon",
    );

    assert.equal(
      plan.notificationId,
      remainingBalanceNotificationId(
        "provider_request_123",
        "due_soon",
      ),
    );
  },
);

test(
  "due date transition creates due reminder",
  () => {
    const plan =
      remainingBalanceLifecyclePlan({
        providerRequestId:
          "provider_request_123",

        providerRequest:
          request({
            remainingBalanceStatus:
              "due_soon",
          }),

        now:
          new Date(
            "2026-10-13T00:00:00+08:00",
          ),
      });

    assert.equal(
      plan?.nextStatus,
      "due",
    );

    assert.equal(
      plan?.reminder?.stage,
      "due",
    );
  },
);

test(
  "post-due transition enters grace period",
  () => {
    const plan =
      remainingBalanceLifecyclePlan({
        providerRequestId:
          "provider_request_123",

        providerRequest:
          request({
            remainingBalanceStatus:
              "due",
          }),

        now:
          new Date(
            "2026-10-14T00:00:00+08:00",
          ),
      });

    assert.equal(
      plan?.nextStatus,
      "grace_period",
    );

    assert.equal(
      plan?.reminder?.stage,
      "grace_period",
    );
  },
);

test(
  "exclusive grace boundary transitions to overdue",
  () => {
    const plan =
      remainingBalanceLifecyclePlan({
        providerRequestId:
          "provider_request_123",

        providerRequest:
          request({
            remainingBalanceStatus:
              "grace_period",
          }),

        now:
          new Date(
            "2026-10-16T00:00:00+08:00",
          ),
      });

    assert.equal(
      plan?.nextStatus,
      "overdue",
    );

    assert.equal(
      plan?.reminder?.stage,
      "overdue",
    );
  },
);

test(
  "fully settled remaining balance becomes paid without reminder",
  () => {
    const plan =
      remainingBalanceLifecyclePlan({
        providerRequestId:
          "provider_request_123",

        providerRequest:
          request({
            settlementStatus:
              "fully_settled",

            outstandingAmountInCentavos:
              0,

            remainingBalanceStatus:
              "due",
          }),

        now:
          new Date(
            "2026-10-13T00:00:00+08:00",
          ),
      });

    assert.equal(
      plan?.nextStatus,
      "paid",
    );

    assert.equal(
      plan?.reminder,
      null,
    );

    assert.equal(
      plan?.notificationId,
      null,
    );
  },
);

test(
  "initial payment lifecycle does not receive remaining-balance reminders",
  () => {
    const plan =
      remainingBalanceLifecyclePlan({
        providerRequestId:
          "provider_request_123",

        providerRequest:
          request({
            status:
              "waiting_for_down_payment",

            settlementStatus:
              "unpaid",
          }),

        now:
          new Date(
            "2026-10-13T00:00:00+08:00",
          ),
      });

    assert.equal(
      plan,
      null,
    );
  },
);

test(
  "notification identity is stable per request and lifecycle stage",
  () => {
    const first =
      remainingBalanceNotificationId(
        "provider_request_123",
        "overdue",
      );

    const second =
      remainingBalanceNotificationId(
        "provider_request_123",
        "overdue",
      );

    const different =
      remainingBalanceNotificationId(
        "provider_request_123",
        "due",
      );

    assert.equal(
      first,
      second,
    );

    assert.notEqual(
      first,
      different,
    );
  },
);
test(
  "overdue remaining balance becomes paid after settlement",
  () => {
    const plan =
      remainingBalanceLifecyclePlan({
        providerRequestId:
          "provider_request_123",

        providerRequest:
          request({
            settlementStatus:
              "fully_settled",

            outstandingAmountInCentavos:
              0,

            remainingBalanceStatus:
              "overdue",
          }),

        now:
          new Date(
            "2026-10-17T10:00:00+08:00",
          ),
      });

    assert.equal(
      plan?.nextStatus,
      "paid",
    );

    assert.equal(
      plan?.changed,
      true,
    );

    assert.equal(
      plan?.reminder,
      null,
    );

    assert.equal(
      plan?.notificationId,
      null,
    );
  },
);