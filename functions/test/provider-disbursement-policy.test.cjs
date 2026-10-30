const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const {
  providerDisbursementEligibleAt,
  parseProviderPayoutBankingHolidays,
} =
  require(
    "../lib/provider-finance/provider-disbursement-policy.js",
  );

test(
  "ordinary payout is eligible on the third Manila banking day",
  () => {
    const result =
      providerDisbursementEligibleAt({
        anchor:
          new Date(
            "2026-10-16T10:00:00.000Z",
          ),

        trigger:
          "completed_booking",
      });

    assert.equal(
      result.toISOString(),
      "2026-10-21T02:00:00.000Z",
    );
  },
);

test(
  "configured banking holiday moves ordinary payout by one banking day",
  () => {
    const result =
      providerDisbursementEligibleAt({
        anchor:
          new Date(
            "2026-10-16T10:00:00.000Z",
          ),

        trigger:
          "completed_booking",

        bankingHolidays: [
          "2026-10-19",
        ],
      });

    assert.equal(
      result.toISOString(),
      "2026-10-22T02:00:00.000Z",
    );
  },
);

test(
  "payment-default compensation uses one banking day",
  () => {
    const result =
      providerDisbursementEligibleAt({
        anchor:
          new Date(
            "2026-10-16T10:00:00.000Z",
          ),

        trigger:
          "payment_default_compensation",
      });

    assert.equal(
      result.toISOString(),
      "2026-10-19T02:00:00.000Z",
    );
  },
);

test(
  "holiday parser rejects invalid dates",
  () => {
    assert.throws(
      () =>
        parseProviderPayoutBankingHolidays([
          "2026-02-30",
        ]),
    );
  },
);
