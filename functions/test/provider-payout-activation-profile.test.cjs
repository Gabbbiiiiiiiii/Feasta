const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  payMongoActivationUpdateBody,
  validateProviderPayoutActivationProfile,
} = require(path.resolve(
  __dirname,
  "../lib/provider-finance/provider-payout-activation-profile.js",
));

const address = {
  line1: "123 Sample Street",
  city: "Ormoc",
  state: "PH-LEY",
  country: "PH",
  postalCode: "6541",
};

function merchantInput(overrides = {}) {
  return {
    nationality: "phl",
    placeOfBirthCity: "Ormoc",
    placeOfBirthCountry: "ph",
    natureOfWork: "self_employed",
    sourceOfFunds: "other",
    sourceOfFundsOther: "Catering service",
    personTin: "123-456-789",
    currentAddress: address,
    business: {
      legalType: "sole_proprietor",
      address,
      industry: "5811",
      age: "between_1_and_2_years",
      size: "less_than_10",
      estimatedMonthlyVolume: "less_than_100K",
      tin: "123-456-789-000",
    },
    ...overrides,
  };
}

test("merchant activation profile maps registered business fields", () => {
  const profile = validateProviderPayoutActivationProfile(
    merchantInput(),
    "merchant",
  );
  const body = payMongoActivationUpdateBody({
    profile,
    emailAddress: "owner@example.com",
    mobileNumber: "+639171234567",
    tradeName: "Sample Catering",
    description: "Event catering for private celebrations.",
  });

  assert.equal(profile.nationality, "PHL");
  assert.equal(profile.personTin, "123456789");
  assert.equal(body.business.type, "sole_proprietor");
  assert.equal(body.business.industry, "5811");
  assert.equal(body.business.estimated_monthly_volume, "less_than_100K");
  assert.equal(body.business.tin, "123456789000");
  assert.equal(body.person.nature_of_work, "self_employed");
  assert.equal(body.person.address.state, "PH-LEY");
  assert.equal(body.account_id, undefined);
  assert.equal(body.payoutReady, undefined);
});

test("invalid activation enums and browser authority are rejected", () => {
  assert.throws(
    () => validateProviderPayoutActivationProfile(
      merchantInput({
        business: {
          ...merchantInput().business,
          legalType: "registered_business",
        },
      }),
      "merchant",
    ),
    /legalType/u,
  );

  assert.throws(
    () => validateProviderPayoutActivationProfile(
      merchantInput({
        payoutReady: true,
        paymongoAccountId: "org_frombrowser",
      }),
      "merchant",
    ),
    /browser/u,
  );
});

test("individual activation profile does not accept business fields", () => {
  const input = merchantInput();
  delete input.business;
  const profile = validateProviderPayoutActivationProfile(input, "consumer");
  const body = payMongoActivationUpdateBody({
    profile,
    emailAddress: "owner@example.com",
    mobileNumber: "+639171234567",
    tradeName: "Sample Provider",
    description: "Individual event services.",
  });
  assert.equal(profile.business, null);
  assert.equal(body.business, undefined);
});
