const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repositoryRoot = path.resolve(__dirname, "../..");
const source = (relativePath) => readFileSync(
  path.join(repositoryRoot, relativePath),
  "utf8",
);

test("Firebase Auth remains the canonical global phone owner", () => {
  const helper = source("functions/src/shared/phone-identity.ts");
  assert.match(helper, /getUserByPhoneNumber\(phoneNumber\)/u);
  assert.match(helper, /owner\.uid !== authUser\.uid/u);
  assert.match(helper, /provider\.providerId === "phone"/u);
  assert.match(helper, /normalizePhilippineMobile\(authUser\.phoneNumber\)/u);
  assert.doesNotMatch(helper, /phoneIdentityReservations/u);
});

test("malformed FEASTA phone projections fail closed across roles", () => {
  const helper = source("functions/src/shared/phone-identity.ts");
  assert.match(helper, /collection\("users"\)/u);
  assert.match(helper, /collection\("customers"\)/u);
  assert.match(helper, /collection\("providers"\)/u);
  assert.match(helper, /document\.id !== uid/u);
  assert.match(helper, /document\.data\(\)\.ownerId !== uid/u);
});

test("phone verification preparation never writes an unverified projection", () => {
  for (const relativePath of [
    "functions/src/auth/prepare-customer-phone-verification.ts",
    "functions/src/auth/prepare-provider-phone-verification.ts",
  ]) {
    const callable = source(relativePath);
    assert.match(callable, /requirePhoneAvailableToUid/u);
    assert.doesNotMatch(callable, /transaction\.update/u);
    assert.doesNotMatch(callable, /isPhoneVerified:\s*false/u);
  }
});

test("customer bootstrap rejects client-supplied phone authority", () => {
  const customer = source("functions/src/auth/ensure-user-profile.ts");
  assert.match(customer, /authoritativeFirebasePhone\(authUser\)/u);
  assert.match(customer, /requireGlobalPhoneIdentityOwnership/u);
  assert.doesNotMatch(customer, /input\.phoneNumber/u);
  const mobile = source(
    "apps/customer_mobile/lib/features/authentication/data/repositories/auth_repository.dart",
  );
  const customerBootstrap = mobile.slice(
    mobile.indexOf("Future<void> _ensureCustomerProfile"),
    mobile.indexOf("CustomerRegistrationFailureKind _registrationFailureKind"),
  );
  assert.doesNotMatch(customerBootstrap, /phoneNumber/u);
});

test("trusted provider and session boundaries recheck global ownership", () => {
  assert.match(
    source("functions/src/shared/provider-identity-prerequisites.ts"),
    /await requireGlobalPhoneIdentityOwnership/u,
  );
  assert.match(
    source("functions/src/auth/sync-phone-verification.ts"),
    /await requireGlobalPhoneIdentityOwnership\(authUser\)/u,
  );
  assert.match(
    source("apps/web/src/lib/auth/session.ts"),
    /requireServerPhoneIdentityOwnership/u,
  );
  assert.match(
    source("apps/web/src/lib/auth/provider-registration-server.ts"),
    /requireServerPhoneIdentityOwnership/u,
  );
});

test("browser rules deny direct identity phone projection writes", () => {
  const rules = source("firebase/firestore.rules");
  const userUpdate = rules.match(
    /match \/users\/\{userId\}[\s\S]*?allow update:[\s\S]*?allow delete/u,
  )?.[0] ?? "";
  const customerUpdate = rules.match(
    /match \/customers\/\{customerId\}[\s\S]*?allow update:[\s\S]*?allow delete/u,
  )?.[0] ?? "";
  assert.doesNotMatch(userUpdate, /changesOnly\(\[[\s\S]*?'phoneNumber'/u);
  assert.doesNotMatch(customerUpdate, /changesOnly\(\[[\s\S]*?'phoneNumber'/u);
});

test("no public phone-existence endpoint or browser lookup was added", () => {
  const classify = source(
    "apps/web/src/app/api/auth/provider-registration/classify/route.ts",
  );
  assert.match(classify, /verifyProviderPhoneClassificationToken/u);
  assert.match(classify, /assertTrustedMutation/u);
  assert.doesNotMatch(classify, /getUserByPhoneNumber/u);
  for (const client of [
    "apps/web/src/lib/auth/provider-client.ts",
    "apps/web/src/lib/auth/customer-phone-client.ts",
  ]) {
    assert.doesNotMatch(source(client), /where\(["']phoneNumber/u);
  }
});
