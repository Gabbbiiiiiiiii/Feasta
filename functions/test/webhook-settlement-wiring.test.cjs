const assert =
  require("node:assert/strict");

const {
  readFileSync,
} =
  require("node:fs");

const path =
  require("node:path");

const test =
  require("node:test");

const ts = require("typescript");

const webhook =
  readFileSync(
    path.resolve(
      __dirname,
      "../src/payments/process-webhook.ts",
    ),
    "utf8",
  ).replace(/\r\n/g, "\n");

test(
  "webhook applies trusted settlement projection to provider requests",
  () => {
    assert.match(
      webhook,
      /providerRequestSettlementUpdateForPaymentOutcome/u,
    );

    assert.match(
      webhook,
      /createProviderRequestPaymentUpdate\([\s\S]*?providerRequestId: string/u,
    );

    assert.match(
      webhook,
      /providerRequestSettlementUpdateForPaymentOutcome\(\{[\s\S]*?providerRequestId,[\s\S]*?providerRequest,[\s\S]*?paymentId,[\s\S]*?paymentStatus:[\s\S]*?status/u,
    );
  },
);

function assertBalancePaymentLifecycle(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  const module = ts.createSourceFile("process-webhook.ts", normalized, ts.ScriptTarget.Latest, true);
  const declaration = module.statements.find((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === "createProviderRequestPaymentUpdate");
  assert.ok(declaration?.body, "Expected the payment-update function.");
  const scoped = normalized.slice(declaration.getStart(module), declaration.end);
  assert.match(scoped, /const isBalancePayment[\s\S]*?remainingBalancePaymentId[\s\S]*?paymentId/u);
  assert.match(scoped, /if \(isBalancePayment\) \{[\s\S]*?return \{[\s\S]*?update:/u);

  const branch = declaration.body.statements.find((statement) =>
    ts.isIfStatement(statement) && ts.isIdentifier(statement.expression) &&
    statement.expression.text === "isBalancePayment");
  assert.ok(branch && ts.isBlock(branch.thenStatement), "Expected the complete balance-payment branch.");
  assert.equal(branch.thenStatement.statements.length, 1);
  assert.ok(ts.isReturnStatement(branch.thenStatement.statements[0]), "Balance payments must return immediately.");
  const block = normalized.slice(branch.thenStatement.getStart(module), branch.thenStatement.end);
  assert.doesNotMatch(block, /statusOverride/u);
  assert.doesNotMatch(block, /status:\s*"waiting_for_down_payment"/u);
  assert.doesNotMatch(block, /status:\s*"confirmed"/u);
}

test(
  "remaining-balance webhook does not override provider-request lifecycle",
  () => {
    assertBalancePaymentLifecycle(webhook);
  },
);

for (const [name, newline] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
  test("complete " + name + " balance branch rejects lifecycle overrides after nested updates", () => {
    const fixture = [
      "function createProviderRequestPaymentUpdate() {",
      "  const isBalancePayment = providerRequest.remainingBalancePaymentId === paymentId;",
      "  if (isBalancePayment) {",
      "    return {",
      "      update: {paymentStatus: status, nested: {status: 'clear'}},",
      "      /* override fixture */",
      "    };",
      "  }",
      "  if (status === 'paid') return {statusOverride: 'confirmed'};",
      "}",
    ].join(newline);
    assertBalancePaymentLifecycle(fixture);
    for (const override of [
      'statusOverride: "confirmed",',
      'status: "confirmed",',
      'status: "waiting_for_down_payment",',
    ]) {
      assert.throws(() => assertBalancePaymentLifecycle(
        fixture.replace("/* override fixture */", override),
      ), {code: "ERR_ASSERTION"});
    }
  });
}

test(
  "initial payment webhook retains canonical lifecycle transitions",
  () => {
    assert.match(
      webhook,
      /statusOverride:\s*"confirmed"/u,
    );

    assert.match(
      webhook,
      /statusOverride:\s*\n\s*"waiting_for_down_payment"/u,
    );
  },
);

test(
  "balance payment bypasses only initial provider operational confirmation",
  () => {
    assert.match(
      webhook,
      /nextStatus === "paid" &&[\s\S]*?payment\.paymentChoice !==[\s\S]*?"remaining_balance"/u,
    );
  },
);
