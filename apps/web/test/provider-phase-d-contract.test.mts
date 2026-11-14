import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");

test("Phase D dashboard selects limited data without weakening approved data", async () => {
  const [page, limited, approved] = await Promise.all([
    source("app/provider/page.tsx"),
    source("lib/provider/dashboard/limited-provider-dashboard-service.ts"),
    source("lib/provider/dashboard/provider-dashboard-service.ts"),
  ]);

  assert.match(page, /if \(!account\.emailVerified\)/u);
  assert.match(page, /getLimitedProviderDashboardData\(\)/u);
  assert.match(page, /getProviderDashboardData\(\)/u);
  assert.match(limited, /^import "server-only";/u);
  assert.match(limited, /requireProviderIdentityAccess/u);
  assert.match(limited, /\.collection\("users"\)/u);
  assert.deepEqual(
    [...limited.matchAll(/\.collection\("([^"]+)"\)/gu)]
      .map((match) => match[1]),
    ["users"],
  );
  assert.doesNotMatch(limited, /\.count\(\)/u);
  assert.match(
    approved,
    /getProviderDashboardData[\s\S]*?await requireApprovedProvider\(\)/u,
  );
});

test("email-unverified identities are blocked from onboarding and operations", async () => {
  const [session, onboarding, verification, status, notifications] =
    await Promise.all([
      source("lib/auth/session.ts"),
      source("app/provider/onboarding/page.tsx"),
      source("app/provider/verification/page.tsx"),
      source("app/provider/status/page.tsx"),
      source("app/provider/notifications/page.tsx"),
    ]);

  assert.match(onboarding, /requireVerifiedEmail/u);
  assert.match(verification, /requireVerifiedProviderIdentity/u);
  assert.match(status, /requireVerifiedProviderIdentity/u);
  assert.match(notifications, /requireVerifiedProviderIdentity/u);
  assert.match(
    session,
    /requireProviderCatalogAccess[\s\S]*?requireOnboardingReadyProvider\(\)/u,
  );
  assert.match(
    session,
    /requireApprovedProvider[\s\S]*?requireOnboardingReadyProvider\(\)/u,
  );
  assert.match(session, /verificationStatus !== "approved"/u);
  assert.match(session, /isSuspended === true/u);
  assert.match(session, /verifyRevocationAwareSession/u);
  assert.match(
    session,
    /requireProviderIdentityAccess[\s\S]*?account\.emailVerified[\s\S]*?"\/provider-verify-phone"[\s\S]*?"\/provider-verify-email"/u,
  );
});

test("Phase C completion refreshes auth, creates a trusted session, and routes to provider", async () => {
  const [client, form] = await Promise.all([
    source("lib/auth/provider-client.ts"),
    source("app/provider-register/provider-phone-registration-form.tsx"),
  ]);

  assert.match(
    client,
    /establishProviderIdentitySession[\s\S]*?reload\(user\)[\s\S]*?getIdToken\(true\)[\s\S]*?exchangeCurrentUserForSession\("provider", "\/provider"\)/u,
  );
  assert.match(form, /await establishProviderIdentitySession\(\)/u);
  assert.match(form, /router\.replace\("\/provider"\)/u);
  assert.doesNotMatch(form, /provider-verify-email\?registration=complete/u);
});

test("limited verification controls only trust Firebase and refreshed server state", async () => {
  const [dashboard, client] = await Promise.all([
    source("components/provider/limited-provider-dashboard.tsx"),
    source("lib/auth/provider-client.ts"),
  ]);

  assert.match(dashboard, /Resend verification email/u);
  assert.match(dashboard, /I&apos;ve verified my email/u);
  assert.match(dashboard, /await refreshProviderVerification\(\)/u);
  assert.match(dashboard, /if \(result\.verified\)/u);
  assert.doesNotMatch(dashboard, /setEmailVerified|emailVerified\s*=\s*true/u);
  assert.match(
    client,
    /refreshProviderVerification[\s\S]*?reload\(user\)[\s\S]*?if \(!user\.emailVerified\)[\s\S]*?exchangeCurrentUserForSession/u,
  );
});
