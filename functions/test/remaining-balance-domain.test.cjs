const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const libRoot =
  path.join(__dirname, "..", "lib");

const {
  remainingBalanceSchedule,
  remainingBalanceCheckoutReason,
} = require(path.join(
  libRoot,
  "payments",
  "remaining-balance-domain.js",
));

const policy = {
  dueSoonWindowDays: 3,
  gracePeriodDays: 2,
};

function manilaDate(
  value,
) {
  return new Date(
    `${value}T00:00:00+08:00`,
  );
}

test(
  "deposit balance due date uses Manila calendar days",
  () => {
    const result =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),
        balanceDueDaysBeforeEvent: 7,
        remainingBalanceInCentavos:
          70000,
        settledBalanceInCentavos: 0,
        cancelled: false,
        now:
          manilaDate("2026-10-01"),
        policy,
      });

    assert.equal(
      result.eventStartsOn,
      "2026-10-20",
    );

    assert.equal(
      result.dueAt.toISOString(),
      "2026-10-12T16:00:00.000Z",
    );

    assert.equal(
      result.status,
      "not_due",
    );
  },
);

test(
  "remaining balance becomes due soon inside configured window",
  () => {
    const result =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),
        balanceDueDaysBeforeEvent: 7,
        remainingBalanceInCentavos:
          70000,
        settledBalanceInCentavos: 0,
        cancelled: false,
        now:
          manilaDate("2026-10-11"),
        policy,
      });

    assert.equal(
      result.status,
      "due_soon",
    );
  },
);

test(
  "remaining balance is due on authoritative due date",
  () => {
    const result =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),
        balanceDueDaysBeforeEvent: 7,
        remainingBalanceInCentavos:
          70000,
        settledBalanceInCentavos: 0,
        cancelled: false,
        now:
          manilaDate("2026-10-13"),
        policy,
      });

    assert.equal(
      result.status,
      "due",
    );
  },
);

test(
  "remaining balance enters configured grace period after due date",
  () => {
    const result =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),
        balanceDueDaysBeforeEvent: 7,
        remainingBalanceInCentavos:
          70000,
        settledBalanceInCentavos: 0,
        cancelled: false,
        now:
          manilaDate("2026-10-14"),
        policy,
      });

    assert.equal(
      result.status,
      "grace_period",
    );
  },
);

test(
  "remaining balance stays in grace through the entire final grace day",
  () => {
    const result =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),

        balanceDueDaysBeforeEvent:
          7,

        remainingBalanceInCentavos:
          70000,

        settledBalanceInCentavos:
          0,

        cancelled:
          false,

        now:
          new Date(
            "2026-10-15T23:59:59.999+08:00",
          ),

        policy,
      });

    assert.equal(
      result.status,
      "grace_period",
    );

    /*
     * graceEndsAt is exclusive:
     * Oct 16 00:00 Manila =
     * Oct 15 16:00 UTC.
     */
    assert.equal(
      result.graceEndsAt.toISOString(),
      "2026-10-15T16:00:00.000Z",
    );
  },
);

test(
  "remaining balance becomes overdue exactly at the exclusive grace boundary",
  () => {
    const result =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),

        balanceDueDaysBeforeEvent:
          7,

        remainingBalanceInCentavos:
          70000,

        settledBalanceInCentavos:
          0,

        cancelled:
          false,

        now:
          new Date(
            "2026-10-16T00:00:00.000+08:00",
          ),

        policy,
      });

    assert.equal(
      result.status,
      "overdue",
    );
  },
);

test(
  "zero grace days become overdue immediately after the due calendar day",
  () => {
    const zeroGracePolicy = {
      dueSoonWindowDays:
        3,

      gracePeriodDays:
        0,
    };

    const dueDay =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),

        balanceDueDaysBeforeEvent:
          7,

        remainingBalanceInCentavos:
          70000,

        settledBalanceInCentavos:
          0,

        cancelled:
          false,

        now:
          new Date(
            "2026-10-13T23:59:59.999+08:00",
          ),

        policy:
          zeroGracePolicy,
      });

    assert.equal(
      dueDay.status,
      "due",
    );

    const nextMidnight =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),

        balanceDueDaysBeforeEvent:
          7,

        remainingBalanceInCentavos:
          70000,

        settledBalanceInCentavos:
          0,

        cancelled:
          false,

        now:
          new Date(
            "2026-10-14T00:00:00.000+08:00",
          ),

        policy:
          zeroGracePolicy,
      });

    assert.equal(
      nextMidnight.status,
      "overdue",
    );
  },
);

test(
  "remaining balance becomes overdue after grace deadline",
  () => {
    const result =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),
        balanceDueDaysBeforeEvent: 7,
        remainingBalanceInCentavos:
          70000,
        settledBalanceInCentavos: 0,
        cancelled: false,
        now:
          manilaDate("2026-10-16"),
        policy,
      });

    assert.equal(
      result.status,
      "overdue",
    );
  },
);

test(
  "customer may pay the full remaining balance early",
  () => {
    const result =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),
        balanceDueDaysBeforeEvent: 7,
        remainingBalanceInCentavos:
          70000,
        settledBalanceInCentavos:
          70000,
        cancelled: false,
        now:
          manilaDate("2026-10-01"),
        policy,
      });

    assert.equal(
      result.status,
      "paid",
    );

    assert.equal(
      result.remainingAmountInCentavos,
      0,
    );
  },
);

test(
  "zero authoritative remaining balance is not applicable",
  () => {
    const result =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),
        balanceDueDaysBeforeEvent: 7,
        remainingBalanceInCentavos: 0,
        settledBalanceInCentavos: 0,
        cancelled: false,
        now:
          manilaDate("2026-10-01"),
        policy,
      });

    assert.equal(
      result.status,
      "not_applicable",
    );

    assert.equal(
      result.dueAt,
      null,
    );
  },
);

test(
  "cancelled booking cannot remain payable",
  () => {
    const schedule =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),
        balanceDueDaysBeforeEvent: 7,
        remainingBalanceInCentavos:
          70000,
        settledBalanceInCentavos: 0,
        cancelled: true,
        now:
          manilaDate("2026-10-01"),
        policy,
      });

    assert.equal(
      schedule.status,
      "cancelled",
    );

    assert.equal(
      remainingBalanceCheckoutReason({
        schedule,
        hasConflictingCheckout: false,
        cancellationActive: false,
      }),
      "cancellation_in_progress",
    );
  },
);

test(
  "active cancellation blocks remaining balance checkout",
  () => {
    const schedule =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),
        balanceDueDaysBeforeEvent: 7,
        remainingBalanceInCentavos:
          70000,
        settledBalanceInCentavos: 0,
        cancelled: false,
        now:
          manilaDate("2026-10-01"),
        policy,
      });

    assert.equal(
      remainingBalanceCheckoutReason({
        schedule,
        hasConflictingCheckout: false,
        cancellationActive: true,
      }),
      "cancellation_in_progress",
    );
  },
);

test(
  "existing balance checkout blocks a duplicate checkout",
  () => {
    const schedule =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),
        balanceDueDaysBeforeEvent: 7,
        remainingBalanceInCentavos:
          70000,
        settledBalanceInCentavos: 0,
        cancelled: false,
        now:
          manilaDate("2026-10-01"),
        policy,
      });

    assert.equal(
      remainingBalanceCheckoutReason({
        schedule,
        hasConflictingCheckout: true,
        cancellationActive: false,
      }),
      "remaining_balance_checkout_exists",
    );
  },
);

test(
  "paid balance cannot open another checkout",
  () => {
    const schedule =
      remainingBalanceSchedule({
        eventDate:
          manilaDate("2026-10-20"),
        balanceDueDaysBeforeEvent: 7,
        remainingBalanceInCentavos:
          70000,
        settledBalanceInCentavos:
          70000,
        cancelled: false,
        now:
          manilaDate("2026-10-01"),
        policy,
      });

    assert.equal(
      remainingBalanceCheckoutReason({
        schedule,
        hasConflictingCheckout: false,
        cancellationActive: false,
      }),
      "remaining_balance_not_payable",
    );
  },
);

test(
  "settled money cannot exceed authoritative remaining balance",
  () => {
    assert.throws(
      () =>
        remainingBalanceSchedule({
          eventDate:
            manilaDate("2026-10-20"),
          balanceDueDaysBeforeEvent: 7,
          remainingBalanceInCentavos:
            70000,
          settledBalanceInCentavos:
            70001,
          cancelled: false,
          now:
            manilaDate("2026-10-01"),
          policy,
        }),
      /cannot exceed/u,
    );
  },
);