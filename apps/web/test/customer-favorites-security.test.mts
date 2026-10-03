import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const repositoryRoot = new URL("../../../", import.meta.url);

const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");

test("favorite mutations derive customer ownership from the trusted session", async () => {
  const [action, service, control] = await Promise.all([
    source("app/customer/favorites/actions.ts"),
    source("lib/customer/favorites/customer-favorite-service.ts"),
    source("components/customer/favorites/provider-favorite-control.tsx"),
  ]);

  assert.match(action, /requireVerifiedEmail\(await requireCustomer\(\)\)/u);
  assert.match(action, /customerId:\s*account\.uid/u);
  assert.doesNotMatch(
    action.slice(action.indexOf("input:"), action.indexOf("): Promise")),
    /customerId/u,
  );
  assert.match(service, /adminDb\.runTransaction/u);
  assert.match(service, /normalizePublicProvider/u);
  assert.match(service, /favoriteDocumentId\(normalizedCustomerId, providerId\)/u);
  assert.doesNotMatch(control, /collection\(|setDoc\(|updateDoc\(/u);
});

test("favorite reads are bounded, batched, and public-provider normalized", async () => {
  const [service, directory, profile] = await Promise.all([
    source("lib/customer/favorites/customer-favorite-service.ts"),
    source("app/customer/providers/page.tsx"),
    source("app/customer/providers/[providerId]/page.tsx"),
  ]);

  assert.match(service, /FAVORITES_PAGE_LIMIT = 48/u);
  assert.match(service, /\.limit\(FAVORITES_PAGE_LIMIT\)/u);
  assert.match(service, /adminDb\.getAll/u);
  assert.match(service, /normalizePublicProvider/u);
  assert.match(directory, /authenticatedCustomer\s*\?\s*await getCustomerFavoriteProviderIds/u);
  assert.match(profile, /authenticatedCustomer\s*\?\s*await getCustomerFavoriteProviderIds/u);
  assert.doesNotMatch(directory, /page\.providers\.map\([^)]*getCustomerFavoriteProviderIds/u);
});

test("Favorites is protected and unavailable providers are omitted", async () => {
  const [page, proxy, routePolicy, service] = await Promise.all([
    source("app/customer/favorites/page.tsx"),
    source("proxy.ts"),
    source("lib/customer/providers/provider-route-policy.ts"),
    source("lib/customer/favorites/customer-favorite-service.ts"),
  ]);

  assert.match(page, /requireVerifiedEmail\(await requireCustomer\(\)\)/u);
  assert.match(proxy, /PROTECTED_PREFIXES = \["\/customer"/u);
  assert.doesNotMatch(routePolicy, /customer\/favorites/u);
  assert.match(service, /return provider \? \[provider\] : \[\]/u);
});

test("Firestore favorites rules constrain role, ownership, fields, ID, and visibility", async () => {
  const rules = await readFile(
    new URL("firebase/firestore.rules", repositoryRoot),
    "utf8",
  );
  const favorites = rules.slice(
    rules.indexOf("match /favorites/{favoriteId}"),
    rules.indexOf("// notifications"),
  );

  assert.match(favorites, /isCustomer\(\)/u);
  assert.match(favorites, /data\.keys\(\)\.hasOnly/u);
  assert.match(favorites, /favoriteId == currentUserId\(\) \+ '_' \+ data\.providerId/u);
  assert.doesNotMatch(favorites, /''/u);
  assert.match(favorites, /isPublicProvider\(data\.providerId\)/u);
  assert.match(favorites, /allow update: if false/u);
});
