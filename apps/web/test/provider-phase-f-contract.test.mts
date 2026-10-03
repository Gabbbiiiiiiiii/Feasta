import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

import {
  providerAccountDestination,
  providerAccessDestination,
} from "../src/lib/auth/account-policy.ts";
import {
  firstIncompleteSetupStep,
  providerOnboardingPath,
} from "../src/lib/provider/onboarding.ts";

const webSourceRoot = new URL("../src/", import.meta.url);
const repositoryRoot = new URL("../../../", import.meta.url);
const webSource = (path: string) =>
  readFile(new URL(path, webSourceRoot), "utf8");
const repositorySource = (path: string) =>
  readFile(new URL(path, repositoryRoot), "utf8");

test("trusted provider policy hands a verified identity to onboarding", () => {
  const identity = {
    emailVerified: true,
    isPhoneVerified: true,
    provider: null,
  } as const;

  assert.equal(providerAccountDestination(identity), "/provider/onboarding");
  assert.equal(providerAccessDestination(identity), "/provider/onboarding");
});

test("onboarding resumes its first incomplete step without a second state model", () => {
  assert.equal(firstIncompleteSetupStep([]).slug, "owner");
  assert.equal(firstIncompleteSetupStep([1, 2, 3]).slug, "location");
  assert.equal(
    providerOnboardingPath(firstIncompleteSetupStep([1, 2, 3])),
    "/provider/onboarding/location",
  );
});

test("an interrupted final registration resumes consent instead of looping", () => {
  const retry = firstIncompleteSetupStep([1, 2, 3, 4, 5, 6]);
  assert.equal(retry.slug, "consent");
  assert.equal(providerOnboardingPath(retry), "/provider/onboarding/consent");
});

test("registration handoff and onboarding routes use trusted server state", async () => {
  const [verificationClient, sessionClient, sessionRoute, onboarding, step] =
    await Promise.all([
      webSource("lib/auth/provider-client.ts"),
      webSource("lib/auth/client-session.ts"),
      webSource("app/api/auth/session/route.ts"),
      webSource("app/provider/onboarding/page.tsx"),
      webSource("app/provider/onboarding/[step]/page.tsx"),
    ]);

  assert.match(
    verificationClient,
    /refreshProviderVerification[\s\S]*?reload\(user\)[\s\S]*?user\.emailVerified[\s\S]*?exchangeCurrentUserForSession\("provider", "\/provider"\)/u,
  );
  assert.match(
    sessionClient,
    /exchangeCurrentUserForSession[\s\S]*?getIdToken\(true\)/u,
  );
  assert.match(sessionRoute, /createSession\(body\.idToken\)/u);
  assert.match(
    sessionRoute,
    /safeAccountReturnPath\(body\.returnTo, account\)/u,
  );
  for (const route of [onboarding, step]) {
    assert.match(route, /requireProvider\(\)/u);
    assert.match(route, /requireVerifiedEmail/u);
    assert.match(
      route,
      /providerAccessDestination\(\s*account,?\s*\)/u,
    );
    assert.match(
      route,
      /loadProviderOnboardingDraft\(\s*account,?\s*\)/u,
    );
  }
  assert.match(step, /requestedStep\.number > firstIncomplete\.number/u);
});

test("completed draft applications can edit earlier onboarding steps", async () => {
  const [
    step,
    form,
    verification,
    session,
  ] = await Promise.all([
    webSource(
      "app/provider/onboarding/[step]/page.tsx",
    ),
    webSource(
      "app/provider/onboarding/[step]/provider-onboarding-step-form.tsx",
    ),
    webSource(
      "app/provider/verification/provider-verification-actions.tsx",
    ),
    webSource(
      "lib/auth/session.ts",
    ),
  ]);

  assert.match(
    step,
    /loadProviderOnboardingReview/u,
  );

  assert.match(
    step,
    /editingExistingApplication/u,
  );

  assert.doesNotMatch(
    step,
    /reviewOnly/u,
  );

  assert.match(
    form,
    /editingExistingApplication/u,
  );

  assert.match(
    form,
    /saveProviderOnboardingDraft/u,
  );

  assert.match(
    form,
    /Save and continue to documents/u,
  );

  assert.match(
    form,
    /window\.location\.replace\([\s\S]*?\/provider\/verification\?stage=documents/u,
  );

  assert.doesNotMatch(
    form,
    /Review your saved onboarding information\. Use Back and Next/u,
  );

  assert.match(
    verification,
    /\/provider\/onboarding\/consent/u,
  );

  assert.match(
    session,
    /"draft"/u,
  );

  assert.match(
    session,
    /"resubmission_required"/u,
  );
});
test("verification document actions use direct file selection and consistent navigation", async () => {
  const verificationActions =
    await webSource(
      "app/provider/verification/provider-verification-actions.tsx",
    );

  assert.match(
    verificationActions,
    /input\.click\(\)/u,
  );

  assert.match(
    verificationActions,
    />\s*Upload file\s*</u,
  );

  assert.match(
    verificationActions,
    /\/provider\/onboarding\/consent/u,
  );

  assert.match(
    verificationActions,
    /sm:grid-cols-\[auto_minmax\(0,1fr\)_auto\]/u,
  );

  assert.match(
    verificationActions,
    />\s*Review application\s*</u,
  );
});

test("provider agreement is visible inline and registration clears stale onboarding cache", async () => {
  const [
    form,
    agreementPage,
    agreementData,
  ] = await Promise.all([
    webSource(
      "app/provider/onboarding/[step]/provider-onboarding-step-form.tsx",
    ),
    webSource(
      "app/provider-agreement/page.tsx",
    ),
    webSource(
      "lib/provider/provider-agreement.ts",
    ),
  ]);

  assert.match(
    form,
    /PROVIDER_AGREEMENT_SECTIONS/u,
  );

  assert.match(
    form,
    /max-h-\[32rem\][\s\S]*overflow-y-auto/u,
  );

  assert.match(
    form,
    /End of Provider Agreement/u,
  );

  assert.match(
    form,
    /Scroll through the Provider Agreement to the end/u,
  );

  assert.match(
    form,
    /window\.location\.replace\([\s\S]*?\/provider\/verification\?stage=documents/u,
  );

  assert.match(
    agreementPage,
    /PROVIDER_AGREEMENT_SECTIONS/u,
  );

  assert.match(
    agreementData,
    /20\. Questions about this agreement/u,
  );
});

test("legacy verification recovery routes retain trusted destinations", async () => {
  const [emailPage, phonePage, phoneClient] = await Promise.all([
    webSource("app/provider-verify-email/page.tsx"),
    webSource("app/provider-verify-phone/page.tsx"),
    webSource("lib/auth/provider-client.ts"),
  ]);

  assert.match(emailPage, /refreshProviderVerification\(\)/u);
  assert.match(emailPage, /router\.replace\([\s\S]*?result\.destination/u);
  assert.match(phonePage, /requireVerifiedEmail/u);
  assert.match(phonePage, /account\.isPhoneVerified/u);
  assert.match(phonePage, /providerAccessDestination\(account\)/u);
  assert.match(
    phoneClient,
    /confirmProviderPhoneVerification[\s\S]*?syncPhoneVerification[\s\S]*?exchangeCurrentUserForSession\("provider", "\/provider"\)/u,
  );
});

test("backend onboarding writes keep independent trusted prerequisites", async () => {
  const [draft, registration, submission, prerequisites] = await Promise.all([
    repositorySource("functions/src/providers/save-provider-onboarding-draft.ts"),
    repositorySource("functions/src/providers/register-provider.ts"),
    repositorySource("functions/src/verification/submit-provider-verification.ts"),
    repositorySource("functions/src/shared/provider-identity-prerequisites.ts"),
  ]);

  for (const callable of [draft, registration, submission]) {
    assert.match(callable, /requireRole/u);
    assert.match(callable, /requireTrustedProviderIdentity/u);
  }
  assert.match(prerequisites, /authUser\.emailVerified/u);
  assert.match(prerequisites, /provider\.providerId === "password"/u);
  assert.match(prerequisites, /provider\.providerId === "phone"/u);
  assert.match(prerequisites, /userData\?\.isPhoneVerified === true/u);
  assert.match(registration, /\.doc\(authenticatedUser\.uid\)/u);
  assert.match(registration, /beginIdempotentOperation/u);
  assert.match(registration, /transaction\.delete\(onboardingDraftReference\)/u);
});

test("the handoff does not trust browser-owned lifecycle state", async () => {
  const files = await Promise.all([
    webSource("lib/auth/provider-client.ts"),
    webSource("lib/auth/account-policy.ts"),
    webSource("app/provider/onboarding/page.tsx"),
    webSource("app/provider/onboarding/[step]/page.tsx"),
  ]);
  const handoff = files.join("\n");

  assert.doesNotMatch(handoff, /localStorage|sessionStorage/u);
  assert.doesNotMatch(
    handoff,
    /(?:setEmailVerified|setPhoneVerified|setProviderId|setOnboardingStatus)/u,
  );
});
test("onboarding draft rehydrates business registration classification", async () => {
  const session = await webSource(
    "lib/auth/session.ts",
  );

  assert.match(
    session,
    /loadProviderOnboardingDraft[\s\S]*?draft\.businessRegistrationType[\s\S]*?"individual"[\s\S]*?"registered_business"/u,
  );
});
