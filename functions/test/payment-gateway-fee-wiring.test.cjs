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

function source(
  relativePath,
) {
  return readFileSync(
    path.resolve(
      __dirname,
      relativePath,
    ),
    "utf8",
  );
}

const webhook =
  source(
    "../src/payments/process-webhook.ts",
  );

const ledger =
  source(
    "../src/payments/financial-ledger.ts",
  );

const earning =
  source(
    "../src/provider-finance/provider-earning-domain.ts",
  );

const refund =
  source(
    "../src/refunds/refund-accounting-domain.ts",
  );

test(
  "trusted paid webhook stores gateway processing-fee evidence",
  () => {
    assert.match(
      webhook,
      /gatewayProcessingFeeEvidence/u,
    );

    assert.match(
      webhook,
      /source:\s*"paymongo_payment_resource"/u,
    );

    assert.match(
      webhook,
      /gatewayFeeInCentavos === null[\s\S]*?"unavailable"[\s\S]*?"observed"/u,
    );

    assert.match(
      webhook,
      /amountInCentavos:[\s\S]*?gatewayFeeInCentavos/u,
    );
  },
);

test(
  "gateway fee absence is not silently treated as zero",
  () => {
    assert.match(
      webhook,
      /amountInCentavos:[\s\S]*?gatewayFeeInCentavos/u,
    );

    assert.doesNotMatch(
      webhook,
      /gatewayFeeInCentavos\s*\?\?\s*0/u,
    );
  },
);

test(
  "gateway processing fees do not change FEASTA commission or VAT allocation",
  () => {
    assert.doesNotMatch(
      ledger,
      /gatewayProcessingFee|gatewayFeeInCentavos/u,
    );
  },
);

test(
  "gateway processing fees do not reduce Provider earnings",
  () => {
    assert.doesNotMatch(
      earning,
      /gatewayProcessingFee|gatewayFeeInCentavos/u,
    );
  },
);

test(
  "gateway processing fees do not change Customer refund calculations",
  () => {
    assert.doesNotMatch(
      refund,
      /gatewayProcessingFee|gatewayFeeInCentavos/u,
    );
  },
);