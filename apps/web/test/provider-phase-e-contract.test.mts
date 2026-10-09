import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");

test("Phase E uses conservative visible-tab detection and cleans it up", async () => {
  const dashboard = await source(
    "components/provider/limited-provider-dashboard.tsx",
  );

  assert.match(dashboard, /VERIFICATION_POLL_INTERVAL_MS = 20_000/u);
  assert.match(dashboard, /window\.addEventListener\("focus"/u);
  assert.match(dashboard, /document\.addEventListener\("visibilitychange"/u);
  assert.match(dashboard, /document\.visibilityState !== "visible"/u);
  assert.match(dashboard, /window\.removeEventListener\("focus"/u);
  assert.match(dashboard, /document\.removeEventListener\("visibilitychange"/u);
  assert.match(dashboard, /window\.clearInterval\(pollingTimer\)/u);
});

test("automatic and manual checks share one authoritative in-flight path", async () => {
  const dashboard = await source(
    "components/provider/limited-provider-dashboard.tsx",
  );

  assert.match(
    dashboard,
    /operationInProgress\.current \|\| verificationSucceeded\.current/u,
  );
  assert.match(dashboard, /refreshProviderVerification\(\)/u);
  assert.match(dashboard, /checkVerification\("automatic"\)/u);
  assert.match(dashboard, /checkVerification\("manual"\)/u);
  assert.match(dashboard, /verificationSucceeded\.current = true/u);
  assert.doesNotMatch(
    dashboard,
    /setEmailVerified|emailVerified\s*=\s*true|sendEmailVerification[^\n]*automatic/u,
  );
});

test("provider verification refreshes Firebase and renews the trusted session", async () => {
  const [client, sessionClient, sessionRoute] = await Promise.all([
    source("lib/auth/provider-client.ts"),
    source("lib/auth/client-session.ts"),
    source("app/api/auth/session/route.ts"),
  ]);

  assert.match(
    client,
    /refreshProviderVerification[\s\S]*?requireProviderAuthUser\(\)[\s\S]*?reload\(user\)[\s\S]*?if \(!user\.emailVerified\) return \{verified: false\}[\s\S]*?exchangeCurrentUserForSession\("provider", "\/provider"\)/u,
  );
  assert.match(
    sessionClient,
    /exchangeCurrentUserForSession[\s\S]*?getIdToken\(true\)[\s\S]*?expectedRole/u,
  );
  assert.match(sessionRoute, /createSession\(body\.idToken\)/u);
  assert.match(sessionRoute, /safeAccountReturnPath\(body\.returnTo, account\)/u);
  assert.match(sessionRoute, /SESSION_COOKIE_NAME, cookie/u);
  assert.doesNotMatch(
    client,
    /refreshProviderVerification[\s\S]*?(?:firestore|collection\(|doc\(|updateDoc|setDoc)/u,
  );
});
