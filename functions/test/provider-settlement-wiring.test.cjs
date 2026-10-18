const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root =
  path.join(
    __dirname,
    "..",
    "src",
  );

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    "utf8",
  ).replace(/\r\n/g, "\n");
}

test(
  "successful payment creates Provider settlement from canonical earning",
  () => {
    const source =
      read(
        "payments/process-webhook.ts",
      );

    assert.match(
      source,
      /buildProviderSettlementPlan/u,
    );

    assert.match(
      source,
      /\.collection\("providerSettlements"\)/u,
    );

    assert.match(
      source,
      /providerEarningPlan\s*\.earningRecord/su,
    );

    assert.match(
      source,
      /providerSettlementPlan\s*\.settlementRecord/su,
    );
  },
);

test(
  "settlement conflict fails closed before duplicate finance creation",
  () => {
    const source =
      read(
        "payments/process-webhook.ts",
      );

    assert.match(
      source,
      /provider_settlement_conflict/u,
    );

    const conflictCheck =
      source.indexOf(
        "providerSettlementSnapshot?.exists",
      );

    const normalCreate =
      source.lastIndexOf(
        "transaction.create(\n" +
        "          providerSettlementReference",
      );

    assert.ok(
      conflictCheck >= 0,
    );

    assert.ok(
      normalCreate > conflictCheck,
      "Settlement conflict check must precede creation.",
    );

    const conflictStart = source.lastIndexOf("\n      if (", conflictCheck);
    const conflictEnd = source.indexOf("\n      if (", conflictCheck);
    assert.ok(conflictStart >= 0 && conflictEnd > conflictCheck);
    const conflictBlock = source.slice(conflictStart, conflictEnd);
    assert.match(conflictBlock, /providerSettlementPlan &&\s*providerSettlementSnapshot\?\.exists/u);
    assert.match(conflictBlock, /return \{\s*duplicate: false,\s*applied: false,\s*conflict: true,\s*reason:\s*"provider_settlement_conflict",\s*\};/u);
    assert.doesNotMatch(conflictBlock, /transaction\.(?:create|update|delete)\s*\(/u);

    const creations = [...source.matchAll(/transaction\.create\(\s*providerSettlementReference\s*,/gu)];
    assert.equal(creations.length, 2, "Expected both settlement creation paths.");
    for (const creation of creations) {
      assert.ok(creation.index > conflictEnd, "Every settlement create must follow the returning conflict guard.");
    }

    const transactionStart = source.indexOf("const result = await db.runTransaction(");
    assert.ok(transactionStart >= 0 && transactionStart < conflictStart);
    const beforeConflict = source.slice(transactionStart, conflictStart);
    assert.doesNotMatch(beforeConflict, /transaction\.(?:create|update|delete)\s*\(/u);
    for (const write of beforeConflict.matchAll(/transaction\.set\(\s*([A-Za-z_]\w*)/gu)) {
      assert.equal(write[1], "eventReference", "Only webhook evidence may be written before the settlement guard.");
    }
  },
);

test(
  "settlement is persisted on lifecycle conflict",
  () => {
    const source =
      read(
        "payments/process-webhook.ts",
      );

    const conflictStart =
      source.indexOf(
        "if (conflictReason) {",
      );

    const normalStart =
      source.indexOf(
        "const requestPaymentUpdate",
      );

    assert.ok(
      conflictStart >= 0 &&
      normalStart > conflictStart,
    );

    const block =
      source.slice(
        conflictStart,
        normalStart,
      );

    assert.match(
      block,
      /providerSettlementReference/u,
    );

    assert.match(
      block,
      /settlementRecord/u,
    );
  },
);

test(
  "payment webhook never claims Provider payout completion",
  () => {
    const source =
      read(
        "payments/process-webhook.ts",
      );

    assert.doesNotMatch(
      source,
      /providerPaidOut\s*:\s*true/u,
    );
  },
);