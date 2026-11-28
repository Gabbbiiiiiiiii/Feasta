"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const filename = path.resolve(
  __dirname,
  "../src/bookings/multi-provider-mixed-transaction-reader.ts",
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
  if (specifier === "../shared/constants.js") {
    return {
      isApprovedProviderForOperations: data => data.approved === true,
      isProviderPubliclyEligible: (provider, owner) =>
        provider.approved === true && owner.enabled === true,
    };
  }

  if (specifier === "../packages/customer-package-v2.js") {
    return {requireCustomerPackageV2: async () => {}};
  }

  if (specifier === "./multi-provider-package-resolver.js") {
    return {
      resolveMultiProviderPackageCore: ({entry, packageData}) => {
        if (packageData.providerId !== entry.providerId) {
          throw new Error("Package provider mismatch");
        }
        return {
          providerId: entry.providerId,
          packageId: entry.packageId,
          packageName: "Catering",
          basePrice: 10000,
        };
      },
    };
  }

  if (specifier === "./multi-provider-marketplace-reader.js") {
    return {
      readTrustedMarketplaceService: async input => {
        const snapshot = await input.transaction.get(
          input.firestore.collection("addons").doc(input.serviceId),
        );

        if (!snapshot.exists) {
          throw new Error("Service missing");
        }

        const data = snapshot.data();

        if (
          data.revision !== input.expectedRevision ||
          data.providerId !== input.providerId ||
          data.ownerId !== input.ownerId ||
          data.status !== "published"
        ) {
          throw new Error("Marketplace authority mismatch");
        }

        return {
          serviceId: input.serviceId,
          providerId: input.providerId,
          ownerId: input.ownerId,
          priceInCentavos: 250000,
          serviceData: data,
        };
      },
    };
  }

  return originalRequire(specifier);
};

compiled._compile(result.outputText, filename);

const {readTrustedMixedProviderSelections: read} = compiled.exports;

const event = {
  eventType: "wedding",
  eventDate: "2026-12-20",
  eventTime: "10:00",
  eventEndTime: "18:00",
  guestCount: 100,
  eventLocation: "Ormoc City",
  eventAddress: "Ormoc City, Leyte",
  specialRequest: "",
};

const catering = {
  kind: "catering_package",
  providerId: "caterer123",
  packageId: "package123",
  configuration: {event: {...event}},
};

const photography = {
  kind: "marketplace_service",
  providerId: "photographer123",
  serviceId: "service123",
  expectedRevision: 3,
  configuration: {event: {...event}},
};

function fixture(options = {}) {
  const reads = [];

  const docs = {
    "providers/caterer123": {
      ownerId: "caterOwner123",
      approved: true,
      providerServiceType: "catering",
    },
    "providers/photographer123": {
      ownerId: "photoOwner123",
      approved: true,
      providerServiceType: "addon",
    },
    "users/caterOwner123": {enabled: true},
    "users/photoOwner123": {enabled: true},
    "packages/package123": {
      providerId: "caterer123",
      occasionSchemaVersion: 1,
    },
    "addons/service123": {
      providerId: "photographer123",
      ownerId: "photoOwner123",
      status: "published",
      revision: 3,
    },
    ...options.docs,
  };

  const firestore = {
    collection(name) {
      return {
        doc(id) {
          return {path: `${name}/${id}`};
        },
      };
    },
  };

  const transaction = {
    async get(reference) {
      reads.push(reference.path);
      const data = docs[reference.path];
      return {
        exists: data !== undefined,
        data: () => data,
      };
    },
  };

  return {
    reads,
    input: {
      firestore,
      transaction,
      envelope: {
        schemaVersion: 2,
        clientRequestId: "request123",
        event: {...event},
        selections: options.selections || [catering, photography],
      },
    },
  };
}

test("loads Catering package and Photography service", async () => {
  const {input, reads} = fixture();
  const rows = await read(input);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, "catering_package");
  assert.equal(rows[0].resolved.packageId, "package123");
  assert.equal(rows[1].kind, "marketplace_service");
  assert.equal(rows[1].service.serviceId, "service123");

  assert.ok(reads.includes("packages/package123"));
  assert.ok(reads.includes("addons/service123"));
});

test("preserves marketplace-first selection order", async () => {
  const {input} = fixture({
    selections: [photography, catering],
  });
  const rows = await read(input);

  assert.equal(rows[0].kind, "marketplace_service");
  assert.equal(rows[1].kind, "catering_package");
});

test("rejects duplicate provider before Firestore reads", async () => {
  const {input, reads} = fixture({
    selections: [catering, {...photography, providerId: "caterer123"}],
  });

  await assert.rejects(read(input), /identity is invalid/);
  assert.equal(reads.length, 0);
});

test("rejects missing provider", async () => {
  const {input} = fixture({
    docs: {"providers/photographer123": undefined},
  });

  await assert.rejects(read(input), /provider is unavailable/);
});

test("rejects blocked provider owner", async () => {
  const {input} = fixture({
    docs: {"users/photoOwner123": {enabled: false}},
  });

  await assert.rejects(read(input), /provider or owner is unavailable/);
});

test("rejects missing Catering package", async () => {
  const {input} = fixture({
    docs: {"packages/package123": undefined},
  });

  await assert.rejects(read(input), /Catering package is unavailable/);
});

test("rejects stale Photography service revision", async () => {
  const {input} = fixture({
    docs: {
      "addons/service123": {
        providerId: "photographer123",
        ownerId: "photoOwner123",
        status: "published",
        revision: 4,
      },
    },
  });

  await assert.rejects(read(input), /Marketplace authority mismatch/);
});

test("rejects Catering selection for non-Catering provider", async () => {
  const {input} = fixture({
    docs: {
      "providers/caterer123": {
        ownerId: "caterOwner123",
        approved: true,
        providerServiceType: "addon",
      },
    },
  });

  await assert.rejects(read(input), /Catering package provider type is invalid/);
});