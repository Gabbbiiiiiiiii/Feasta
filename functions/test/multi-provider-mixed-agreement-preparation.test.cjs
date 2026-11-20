"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(
  __dirname,
  "../src/bookings/multi-provider-mixed-agreement-preparation.ts",
);

const result = ts.transpileModule(
  fs.readFileSync(filename, "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    reportDiagnostics: true,
  },
);

assert.equal(
  (result.diagnostics || []).filter(
    x => x.category === ts.DiagnosticCategory.Error,
  ).length,
  0,
);

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));

const originalRequire = compiled.require.bind(compiled);

compiled.require = function(specifier) {
  if (specifier === "./booking-payment-agreement.js") {
    return {
      buildBookingPaymentAgreement: input => ({
        ...input,
        agreementKey: `key_${input.providerId}`,
      }),
      bookingPaymentAgreementDisclosure: agreement => ({
        providerId: agreement.providerId,
        agreementKey: agreement.agreementKey,
      }),
      assertBookingPaymentAgreementAcknowledgements:
        (agreements, acknowledgements) => {
          if (
            !Array.isArray(acknowledgements) ||
            agreements.some(a =>
              !acknowledgements.includes(a.agreementKey)
            )
          ) {
            throw new Error("Agreement acknowledgement mismatch");
          }
        },
    };
  }

  if (specifier === "./booking-refund-policy.js") {
    return {
      buildProviderRequestRefundPolicyEvidence: policy => ({
        refundPolicySnapshot: {
          providerId: policy.providerId,
        },
      }),
    };
  }

  if (specifier === "./multi-provider-mixed-financial-preparation.js") {
    return {
      prepareMixedProviderFinancials: rows => {
        const items = rows.map(row =>
          row.kind === "catering_package"
            ? {
                kind: "catering_package",
                providerId: row.providerId,
                packageId: row.resolved.packageId,
                grossAmountInCentavos: 100000,
                packagePaymentTerms: {depositRateBps: 3000},
              }
            : {
                kind: "marketplace_service",
                providerId: row.providerId,
                serviceId: row.service.serviceId,
                grossAmountInCentavos: 25000,
                requiredUpfrontAmountInCentavos: 25000,
                paymentPolicy: "full_payment",
                packagePaymentTerms: null,
              },
        );

        return {
          items,
          cateringSubtotalInCentavos: 100000,
          marketplaceSubtotalInCentavos: 25000,
          totalGrossAmountInCentavos: 125000,
        };
      },
    };
  }

  return originalRequire(specifier);
};

compiled._compile(result.outputText, filename);

const {
  prepareMixedProviderBookingAgreements: prepare,
  confirmMixedProviderBookingAgreements: confirm,
} = compiled.exports;

const start = new Date("2026-12-20T02:00:00.000Z");

function fixture() {
  const rows = [
    {
      kind: "catering_package",
      providerId: "caterer123",
      providerOwnerId: "ownerCater123",
      providerData: {businessName: "Catering Provider"},
      packageData: {},
      resolved: {
        providerId: "caterer123",
        packageId: "package123",
        packageName: "Wedding Buffet",
        offer: {serviceTierLabel: "Full service"},
        foodChoices: [],
      },
    },
    {
      kind: "marketplace_service",
      providerId: "photographer123",
      providerOwnerId: "ownerPhoto123",
      providerData: {businessName: "Photo Provider"},
      service: {
        serviceId: "service123",
        providerId: "photographer123",
        ownerId: "ownerPhoto123",
        name: "Wedding Photography",
        category: "photography",
        priceInCentavos: 25000,
      },
    },
  ];

  const financials = {
    items: [
      {
        kind: "catering_package",
        providerId: "caterer123",
        packageId: "package123",
        grossAmountInCentavos: 100000,
        packagePaymentTerms: {depositRateBps: 3000},
      },
      {
        kind: "marketplace_service",
        providerId: "photographer123",
        serviceId: "service123",
        grossAmountInCentavos: 25000,
        requiredUpfrontAmountInCentavos: 25000,
        paymentPolicy: "full_payment",
        packagePaymentTerms: null,
      },
    ],
    cateringSubtotalInCentavos: 100000,
    marketplaceSubtotalInCentavos: 25000,
    totalGrossAmountInCentavos: 125000,
  };

  const cateringEligibility = new Map([[
    "caterer123",
    {
      providerId: "caterer123",
      packageId: "package123",
      grossAmountInCentavos: 100000,
      bookingPaymentPolicySnapshot: {},
      initialPaymentEligibility: {
        eventStartAt: start,
        depositEligible: true,
        reason: "deposit_eligible",
      },
    },
  ]]);

  return {
    customerId: "customer123",
    rows,
    financials,
    cateringEligibility,
    refunds: {mode: "off", policies: new Map(), disclosures: []},
    guestCount: 100,
    eventEndTime: "18:00",
  };
}

test("creates two independent provider agreements", () => {
  const prepared = prepare(fixture());
  assert.equal(prepared.agreements.length, 2);
  assert.equal(prepared.disclosures.length, 2);
});

test("preserves Catering's 30 percent initial payment", () => {
  const prepared = prepare(fixture());
  assert.equal(
    prepared.agreements[0].requiredUpfrontAmountInCentavos,
    30000,
  );
  assert.equal(prepared.agreements[0].depositEligible, true);
});

test("requires Photography's full price upfront", () => {
  const prepared = prepare(fixture());
  const photo = prepared.agreements[1];
  assert.equal(photo.requiredUpfrontAmountInCentavos, 25000);
  assert.equal(photo.depositEligible, false);
  assert.deepEqual(photo.paymentPolicy, {
    paymentPolicy: "full_payment",
  });
  assert.equal(photo.selection.services[0].serviceId, "service123");
});

test("rejects incomplete Catering eligibility", () => {
  const input = fixture();
  input.cateringEligibility.clear();
  assert.throws(
    () => prepare(input),
    /Catering eligibility set is incomplete/,
  );
});

test("rejects tampered Photography payment amounts", () => {
  const input = fixture();
  input.financials.items[1].requiredUpfrontAmountInCentavos = 10000;
  assert.throws(
    () => prepare(input),
    /Mixed agreement financial identity is invalid/,
  );
});

test("rejects missing current refund policy", () => {
  const input = fixture();
  input.refunds = {
    mode: "required",
    policies: new Map([
      ["caterer123", {providerId: "caterer123"}],
      ["photographer123", {providerId: "photographer123"}],
    ]),
    disclosures: [],
  };
  input.refunds.policies.delete("photographer123");
  assert.throws(
    () => prepare(input),
    /refund policies are inconsistent/,
  );
});

test("delegates acknowledgement-key validation", () => {
  const prepared = prepare(fixture());

  assert.throws(
    () => confirm(prepared, ["key_caterer123"]),
    /Agreement acknowledgement mismatch/,
  );

  confirm(prepared, [
    "key_caterer123",
    "key_photographer123",
  ]);
});