const test =
  require("node:test");

const assert =
  require("node:assert/strict");

const fs =
  require("node:fs");

const path =
  require("node:path");

function read(
  relativePath,
) {
  return fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "src",
      ...relativePath.split("/"),
    ),
    "utf8",
  );
}

test(
  "remaining-balance lifecycle uses Manila hourly scheduler",
  () => {
    const source =
      read(
        "payments/remaining-balance-lifecycle-scheduler.ts",
      );

    assert.match(
      source,
      /firebase-functions\/v2\/scheduler/u,
    );

    assert.match(
      source,
      /schedule:\s*"0 \* \* \* \*"/su,
    );

    assert.match(
      source,
      /timeZone:\s*"Asia\/Manila"/su,
    );
  },
);

test(
  "scheduler uses deterministic notifications inside transaction",
  () => {
    const scheduler =
      read(
        "payments/remaining-balance-lifecycle-scheduler.ts",
      );

    const notifications =
      read(
        "shared/notifications.ts",
      );

    assert.match(
      scheduler,
      /createNotificationWithIdInTransaction/u,
    );

    assert.match(
      notifications,
      /\.doc\(id\)/u,
    );

    assert.match(
      notifications,
      /buildNotificationData\(input\)/u,
    );
  },
);

test(
  "P10-D does not perform payment or Provider settlement money movement",
  () => {
    const source =
      read(
        "payments/remaining-balance-lifecycle-scheduler.ts",
      );

    assert.doesNotMatch(
      source,
      /api\.paymongo\.com/u,
    );

    assert.doesNotMatch(
      source,
      /batch_transfers/u,
    );

    assert.doesNotMatch(
      source,
      /providerSettlements/u,
    );

    assert.doesNotMatch(
      source,
      /providerEarnings/u,
    );
  },
);

test(
  "scheduler queries only active remaining-balance lifecycle status",
  () => {
    const source =
      read(
        "payments/remaining-balance-lifecycle-scheduler.ts",
      );

    assert.match(
      source,
      /\.where\(\s*"remainingBalanceStatus",\s*"in"/su,
    );

    assert.doesNotMatch(
      source,
      /remainingBalanceDueAt".*where/su,
    );
  },
);

test(
  "scheduled function is exported",
  () => {
    const source =
      read(
        "index.ts",
      );

    assert.match(
      source,
      /reconcileRemainingBalanceLifecycle/u,
    );
  },
);
test(
  "overdue lifecycle remains queryable for late payment reconciliation",
  () => {
    const source =
      read(
        "payments/remaining-balance-lifecycle-scheduler.ts",
      );

    const activeStatuses =
      source.slice(
        source.indexOf(
          "ACTIVE_REMAINING_BALANCE_STATUSES",
        ),
        source.indexOf(
          "] as const;",
          source.indexOf(
            "ACTIVE_REMAINING_BALANCE_STATUSES",
          ),
        ) + 11,
      );

    assert.match(
      activeStatuses,
      /"overdue"/u,
    );
  },
);