const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  assertPackageOfferConfigured,
  assertPackagePublishable,
  parsePackageInput,
  verifyPackageImages,
} = require("../lib/packages/package-domain.js");

const media = require("../lib/shared/cloudinary.js");

const createPackage = readFileSync(
  path.join(__dirname, "../src/packages/create-provider-package.ts"),
  "utf8",
);
const updatePackage = readFileSync(
  path.join(__dirname, "../src/packages/update-provider-package.ts"),
  "utf8",
);

const image = (owner, asset = "theme") =>
  `https://res.cloudinary.com/feasta/image/upload/v1/feasta/providers/${owner}/services/${asset}/image.png`;

const base = {
  name: "Wedding package",
  description: "A complete wedding catering package.",
  eventType: "wedding",
  price: 30000,
  paymentPolicy: "deposit_then_balance",
  depositPercentage: 30,
  balanceDueDaysBeforeEvent: 7,
  minimumGuests: 20,
  maximumGuests: 100,
  imageUrl: "",
  foodInclusions: [],
  decorInclusions: [],
  furnitureInclusions: [],
  serviceInclusions: [],
};

function validOffer(patch = {}) {
  return {
    ...base,
    price: 30000,
    serviceOptions: {
      drop_off: {
        price: 30000,
        includedServices: ["Packed meals"],
      },
      full_service: {
        price: 42000,
        includedServices: ["On-site staff"],
      },
    },
    themeOptions: [
      {
        id: "garden",
        name: "Garden",
        description: "Outdoor styling",
        imageUrls: [],
      },
    ],
    ...patch,
  };
}

test("create and update persist server-validated service and theme options", () => {
  for (const [name, source] of [
    ["createProviderPackage", createPackage],
    ["updateProviderPackage", updatePackage],
  ]) {
    assert.ok(
      source.includes("assertPackageOfferConfigured"),
      `${name} must require a configured offer`,
    );
    assert.ok(
      source.includes("serviceOptions:"),
      `${name} must persist serviceOptions`,
    );
    assert.ok(
      source.includes("themeOptions:"),
      `${name} must persist themeOptions`,
    );
    assert.equal(
      /downPaymentPercentage:\s*100/u.test(source),
      false,
      `${name} must not hardcode full payment`,
    );
  }
});

test("valid service tiers and themes round-trip through parsePackageInput", () => {
  const parsed = parsePackageInput(validOffer());
  assert.deepEqual(parsed.serviceOptions, {
    drop_off: {
      price: 30000,
      includedServices: ["Packed meals"],
    },
    full_service: {
      price: 42000,
      includedServices: ["On-site staff"],
    },
  });
  assert.deepEqual(parsed.themeOptions, [
    {
      id: "garden",
      name: "Garden",
      description: "Outdoor styling",
      imageUrls: [],
    },
  ]);
  assert.equal(parsed.price, 30000);
  assert.equal(parsed.paymentPolicy, "deposit_then_balance");
  assert.equal(parsed.depositPercentage, 30);
  assert.equal(parsed.downPaymentPercentage, 30);
  assert.deepEqual(parsePackageInput(parsed).serviceOptions, parsed.serviceOptions);
  assert.doesNotThrow(() => assertPackageOfferConfigured(parsed));
});

test("legacy packages without serviceOptions remain readable and publishable", () => {
  const parsed = parsePackageInput(base);
  assert.deepEqual(parsed.serviceOptions, {});
  assert.deepEqual(parsed.themeOptions, []);
  assert.equal(parsed.price, 30000);
  assert.doesNotThrow(() => assertPackagePublishable(base));
  assert.throws(
    () => assertPackageOfferConfigured(parsed),
    {code: "invalid-argument"},
  );
});

test("rejects unsupported tier IDs and non-object service option maps", () => {
  assert.throws(
    () => parsePackageInput(validOffer({
      serviceOptions: {
        express: {price: 1000, includedServices: []},
      },
    })),
    {code: "invalid-argument"},
  );
  assert.throws(
    () => parsePackageInput(validOffer({
      serviceOptions: [
        {id: "drop_off", price: 30000, includedServices: []},
      ],
    })),
    {code: "invalid-argument"},
  );
});

test("rejects out-of-bound and imprecise service-tier prices", () => {
  for (const price of [-1, 10_000_001, 10.123, Number.NaN]) {
    assert.throws(
      () => parsePackageInput(validOffer({
        price: Number.isFinite(price) && price >= 0 && price <= 10_000_000
          ? price
          : 30000,
        serviceOptions: {
          drop_off: {price, includedServices: []},
        },
        themeOptions: [],
      })),
      {code: "invalid-argument"},
    );
  }
});

test("package price must equal the lowest enabled service-tier price", () => {
  assert.throws(
    () => parsePackageInput(validOffer({
      price: 31000,
    })),
    {code: "invalid-argument"},
  );
  const parsed = parsePackageInput(validOffer({
    price: 30000,
  }));
  assert.equal(parsed.price, 30000);
});

test("theme options require a setup-based tier and unique IDs", () => {
  assert.throws(
    () => parsePackageInput(validOffer({
      price: 30000,
      serviceOptions: {
        drop_off: {price: 30000, includedServices: []},
      },
    })),
    {code: "invalid-argument"},
  );
  assert.throws(
    () => parsePackageInput(validOffer({
      themeOptions: [
        {id: "garden", name: "Garden", description: "", imageUrls: []},
        {id: "garden", name: "Second", description: "", imageUrls: []},
      ],
    })),
    {code: "invalid-argument"},
  );
});

test("theme option and image bounds are enforced", () => {
  assert.throws(
    () => parsePackageInput(validOffer({
      themeOptions: Array.from({length: 13}, (_, index) => ({
        id: `theme_${index}`,
        name: `Theme ${index}`,
        description: "",
        imageUrls: [],
      })),
    })),
    {code: "invalid-argument"},
  );
  assert.throws(
    () => parsePackageInput(validOffer({
      themeOptions: [
        {
          id: "garden",
          name: "Garden",
          description: "",
          imageUrls: [
            image("owner", "one"),
            image("owner", "two"),
            image("owner", "three"),
            image("owner", "four"),
            image("owner", "five"),
          ],
        },
      ],
    })),
    {code: "invalid-argument"},
  );
});

test("new theme images receive the same ownership verification as package images", async (context) => {
  const verify = context.mock.method(
    media,
    "verifyProviderServiceImage",
    async () => {},
  );
  const themeUrl = image("owner", "theme");
  await verifyPackageImages(
    parsePackageInput(validOffer({
      imageUrl: "",
      themeOptions: [
        {
          id: "garden",
          name: "Garden",
          description: "",
          imageUrls: [themeUrl],
        },
      ],
    })),
    "owner",
  );
  assert.equal(verify.mock.callCount(), 1);
  assert.equal(verify.mock.calls[0].arguments[0].url, themeUrl);
  await verifyPackageImages(
    parsePackageInput(validOffer({
      imageUrl: "",
      themeOptions: [
        {
          id: "garden",
          name: "Garden",
          description: "",
          imageUrls: [themeUrl],
        },
      ],
    })),
    "owner",
    {
      themeOptions: [
        {imageUrls: [themeUrl]},
      ],
    },
  );
  assert.equal(verify.mock.callCount(), 1);
});
