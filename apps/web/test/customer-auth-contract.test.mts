import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const root = new URL("../src/", import.meta.url);

async function source(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("the provider directory and one safe detail segment are public while customer routes retain server gates", async () => {
  const layout = await source("app/customer/layout.tsx");
  const marketplacePage = await source("app/customer/providers/page.tsx");
  const proxy = await source("proxy.ts");
  const routePolicy = await source(
    "lib/customer/providers/provider-route-policy.ts",
  );

  assert.match(routePolicy, /isPublicProviderDirectoryPath/u);
  assert.match(routePolicy, /publicProviderIdFromPath/u);
  assert.match(routePolicy, /PUBLIC_PROVIDER_ID_PATTERN/u);
  assert.match(proxy, /isPublicProviderMarketplacePath\(request\.nextUrl\.pathname\)/u);
  assert.match(proxy, /requestHeaders\.delete\(PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER\)/u);
  assert.match(layout, /publicMarketplaceRequest/u);
  assert.match(layout, /getOptionalAccountContext\(\)/u);
  assert.doesNotMatch(marketplacePage, /requireRole|requireCustomer/u);

  assert.match(layout, /requireCustomer\(\)/u);
  assert.match(
    layout,
    /requireVerifiedEmail\(\s*await requireCustomer\(\),?\s*\)/u,
  );
  assert.match(proxy, /PROTECTED_PREFIXES/u);
});

test("authentication redirects preserve safe path-local query parameters", async () => {
  const proxy = await source("proxy.ts");
  const policy = await source("lib/security/policy.ts");
  const landingHeader = await source("components/landing/landing-header.tsx");

  assert.match(proxy, /request\.nextUrl\.pathname/u);
  assert.match(proxy, /request\.nextUrl\.search/u);
  assert.match(policy, /new URL\(value, base\)\.origin === base\.origin/u);
  assert.match(policy, /decoded\.startsWith\("\/\/"\)/u);
  assert.match(landingHeader, /isPublicProviderMarketplaceReturnPath\(authReturnTo\)/u);
  assert.match(landingHeader, /encodeURIComponent\(safeAuthReturnTo\)/u);
  assert.match(landingHeader, /href="\/customer\/providers"/u);
  assert.match(landingHeader, />\s*Explore Marketplace\s*</u);
  assert.doesNotMatch(landingHeader, /href=\{registerHref\}/u);
});

test("customer registration never supplies a client-selected role", async () => {
  const registration = await source("lib/auth/client-session.ts");
  assert.match(registration, /createUserWithEmailAndPassword/u);
  assert.match(registration, /ensureCustomerProfile/u);
  assert.match(registration, /deleteUser\(credential\.user\)/u);
  assert.match(
    registration.slice(
      registration.indexOf("export async function signInWithEmail"),
      registration.indexOf("export async function signInWithGoogle"),
    ),
    /ensureCustomerProfile\(\{\}\)/u,
  );
  const inputType = registration.slice(
    registration.indexOf("export type CustomerRegistrationInput"),
    registration.indexOf("export class WebAuthenticationError"),
  );
  assert.doesNotMatch(inputType, /\brole\b/u);
});

test("session destinations are validated server-side", async () => {
  const route = await source("app/api/auth/session/route.ts");
  assert.match(route, /safeAccountReturnPath\(body\.returnTo, account\)/u);
  assert.match(route, /destination:/u);
  assert.match(route, /account\.role !== body\.expectedRole/u);
});

test("account action handling ignores untrusted continue URLs", async () => {
  const action = await source("app/auth/action/action-processor.tsx");
  assert.match(action, /continueUrl is intentionally ignored/u);
  assert.doesNotMatch(action, /searchParams\.get\("continueUrl"\)/u);
});
