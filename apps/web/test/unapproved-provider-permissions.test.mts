import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const webSourceRoot = new URL("../src/", import.meta.url);
const repositoryRoot = new URL("../../../", import.meta.url);

const webSource = (path: string) =>
  readFile(new URL(path, webSourceRoot), "utf8");
const repositorySource = (path: string) =>
  readFile(new URL(path, repositoryRoot), "utf8");

test("manually entered provider operation routes retain server guards", async () => {
  const [dashboard, dashboardService, packages, session] = await Promise.all([
    webSource("app/provider/page.tsx"),
    webSource("lib/provider/dashboard/provider-dashboard-service.ts"),
    webSource("app/provider/packages/layout.tsx"),
    webSource("lib/auth/session.ts"),
  ]);

  assert.match(dashboard, /getProviderDashboardData\(\)/u);
  assert.doesNotMatch(dashboard, /firebase-admin|adminDb/u);
  assert.match(
    dashboardService,
    /getProviderDashboardData[\s\S]*?await requireApprovedProvider\(\)/u,
  );
  assert.match(packages, /requireProviderCatalogAccess\(\)/u);
  assert.match(session, /account\.provider\.id !== account\.providerId/u);
  assert.match(session, /verificationStatus !== "approved"/u);
  assert.match(session, /account\.provider\.isActive !== true/u);
  assert.match(session, /account\.provider\.isSuspended === true/u);
  assert.match(session, /account\.provider\.isDeleted === true/u);
});

test("public queries remain available while catalog writes are callable-only", async () => {
  const [firestoreRules, storageRules, mobileRepository] = await Promise.all([
    repositorySource("firebase/firestore.rules"),
    repositorySource("firebase/storage.rules"),
    repositorySource(
      "apps/customer_mobile/lib/features/authentication/data/repositories/feasta_repository.dart",
    ),
  ]);

  assert.match(firestoreRules, /function isApprovedProvider\(providerId\)/u);
  for (const collectionName of ["packages", "menuItems", "addons"]) {
    assert.match(
      firestoreRules,
      new RegExp(
        `match /${collectionName}/\\{[^}]+\\}[\\s\\S]*?` +
          "allow create, update, delete: if false;",
        "u",
      ),
    );
  }
  assert.match(
    firestoreRules,
    /match \/providerRequests[\s\S]*?isApprovedProvider\(request\.resource\.data\.providerId\)/u,
  );
  assert.match(firestoreRules, /allow create, update, delete: if false;/u);
  assert.match(storageRules, /function providerIsApproved\(providerId\)/u);
  assert.doesNotMatch(
    storageRules,
    /match \/providers\/\{providerId\}\/(?:logo|cover|packages)[\s\S]{0,80}allow read: if true;/u,
  );

  const publicProviderQueries =
    mobileRepository.match(/ProviderVerificationStatus\.approved/gu) ?? [];
  assert.ok(publicProviderQueries.length >= 5);
  const publicPackages = mobileRepository.slice(
    mobileRepository.indexOf("Stream<List<PackageModel>> packagesByProvider"),
    mobileRepository.indexOf("Future<PackageModel?> getPackageById"),
  );
  const privatePackages = mobileRepository.slice(
    mobileRepository.indexOf("Stream<List<PackageModel>> myProviderPackages"),
    mobileRepository.indexOf("Future<void> createPackage"),
  );
  assert.match(
    publicPackages,
    /where\('isActive', isEqualTo: true\)/u,
  );
  assert.match(
    privatePackages,
    /where\('isDeleted', isEqualTo: false\)/u,
  );
  assert.doesNotMatch(
    privatePackages,
    /where\('isActive', isEqualTo: true\)/u,
  );
});

test("active provider catalog clients delegate mutations to callables", async () => {
  const [packageClient, serviceClient] = await Promise.all([
    webSource("lib/provider/provider-package-client.ts"),
    webSource("lib/provider/provider-service-client.ts"),
  ]);

  for (const [source, callables] of [
    [packageClient, [
      "createProviderPackage",
      "updateProviderPackage",
      "publishProviderPackage",
      "archiveProviderPackage",
    ]],
    [serviceClient, [
      "createProviderService",
      "updateProviderService",
      "publishProviderService",
      "archiveProviderService",
    ]],
  ] as const) {
    assert.match(source, /httpsCallable/u);
    for (const callable of callables) assert.match(source, new RegExp(callable, "u"));
    assert.doesNotMatch(
      source,
      /\b(?:setDoc|addDoc|updateDoc|deleteDoc|writeBatch)\b/u,
    );
  }
});

test("stale sessions cannot preserve an earlier approval decision", async () => {
  const [session, securityPolicy] = await Promise.all([
    webSource("lib/auth/session.ts"),
    webSource("lib/security/policy.ts"),
  ]);
  assert.match(session, /verifyRevocationAwareSession\(/u);
  assert.match(
    session,
    /adminAuth\.verifySessionCookie\(\s*value,\s*shouldCheckRevocation/u,
  );
  assert.match(securityPolicy, /return verifier\(cookie, checkRevoked\)/u);
  assert.match(
    session,
    /return loadTrustedAccountContext\(\s*decoded\.uid,[\s\S]*?verifiedAuthStateFromToken/u,
  );
  assert.match(session, /adminAuth\.getUser\(uid\)/u);
  assert.match(
    session,
    /adminDb\s*\.collection\("providers"\)\s*\.doc\(providerId\)\s*\.get\(\)/u,
  );
});
