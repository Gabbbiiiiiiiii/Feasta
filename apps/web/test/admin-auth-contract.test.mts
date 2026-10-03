import assert from "node:assert/strict";
import {access, readFile, readdir} from "node:fs/promises";
import test from "node:test";

const sourceRoot = new URL("../src/", import.meta.url);
const source = (path: string) => readFile(new URL(path, sourceRoot), "utf8");

test("admin has login only and cannot select or register an admin role", async () => {
  await access(new URL("app/admin-login/page.tsx", sourceRoot));
  await assert.rejects(
    access(new URL("app/admin-register/page.tsx", sourceRoot)),
  );
  const registrationFiles = [
    "app/register/page.tsx",
    "app/provider-register/page.tsx",
  ];
  for (const file of registrationFiles) {
    const text = await source(file);
    assert.doesNotMatch(text, /value=["']admin["']|role.*admin/iu);
  }
});

test("admin login is role-restricted and preflight rate limited", async () => {
  const client = await source("lib/auth/admin-client.ts");
  assert.match(client, /api\/auth\/admin\/attempt/u);
  assert.match(client, /exchangeCurrentUserForSession\("admin"/u);
  assert.doesNotMatch(client, /ensureUserProfile|createUserWithEmailAndPassword/u);

  const route = await source("app/api/auth/admin/attempt/route.ts");
  assert.match(route, /assertTrustedMutation\(request\)/u);
  assert.match(route, /enforceAdminLoginAttemptRateLimit/u);
  assert.match(route, /Retry-After/u);
  assert.doesNotMatch(route, /body\.email.*log|targetId:.*email/u);

  const limiter = await source("lib/security/session-rate-limit.ts");
  assert.match(limiter, /web\.admin\.login\.ip/u);
  assert.match(limiter, /web\.admin\.login\.account/u);
  assert.match(limiter, /adminDb\.runTransaction/u);
  assert.match(limiter, /WEB_RATE_LIMIT_PEPPER/u);
  assert.match(
    limiter,
    /Math\.floor\(now \/ windowMilliseconds\) \* windowMilliseconds/u,
  );
  assert.match(limiter, /ADMIN_WINDOW_SECONDS - elapsedSeconds/u);
  assert.doesNotMatch(limiter, /new Map|setInterval/u);
});

test("admin routes use revocation-aware server authorization", async () => {
  const session = await source("lib/auth/session.ts");
  assert.match(
    session,
    /requireAdmin[\s\S]*requireRole\(\["admin"\],[\s\S]*loginPath: "\/admin-login"/u,
  );
  assert.match(session, /options\.checkRevoked \?\? true/u);
  assert.match(session, /adminAuth\.getUser\(uid\)/u);
  assert.match(session, /collection\("users"\)/u);
  assert.match(session, /resolveTrustedAccountContext/u);

  const layout = await source("app/admin/layout.tsx");
  assert.match(layout, /requireAdmin\(\)/u);
  const proxy = await source("proxy.ts");
  assert.match(proxy, /admin-login/u);
});

test("no unguarded Next.js admin route handlers or server actions exist", async () => {
  const apiAdmin = new URL("app/api/admin/", sourceRoot);
  const adminApiFiles = await readdir(apiAdmin, {recursive: true});
  const routeFiles = adminApiFiles.filter((file) =>
    /route\.ts$/u.test(file.toString())
  );
  assert.ok(routeFiles.length > 0);
  for (const routeFile of routeFiles) {
    const route = await readFile(
      new URL(routeFile.toString().replaceAll("\\", "/"), apiAdmin),
      "utf8",
    );
    assert.match(route, /getOptionalAccountContext\(\{checkRevoked: true\}\)/u);
    assert.match(route, /account\.role !== "admin"/u);
  }
  const adminFiles = await readdir(new URL("app/admin/", sourceRoot), {
    recursive: true,
  });
  const privilegedFiles = adminFiles.filter((file) =>
    /(?:route|actions?)\.(?:ts|tsx)$/u.test(file.toString())
  );
  const delegatedActions = new Map<string, {
    servicePath: string;
    importPath: string;
    entryPoints: readonly string[];
  }>([
    ["reviews/actions.ts", {
      servicePath: "lib/admin/reviews/admin-review-service.ts",
      importPath: "@/lib/admin/reviews/admin-review-service",
      entryPoints: ["getAdminReviewPage", "getAdminReviewDetails"],
    }],
    ["reports/actions.ts", {
      servicePath: "lib/admin/reports/admin-report-service.ts",
      importPath: "@/lib/admin/reports/admin-report-service",
      entryPoints: ["getAdminReport"],
    }],
    ["payments/actions.ts", {
      servicePath: "lib/admin/payments/admin-payment-service.ts",
      importPath: "@/lib/admin/payments/admin-payment-service",
      entryPoints: ["getAdminPaymentPage", "getAdminPaymentDetails"],
    }],
    ["notifications/actions.ts", {
      servicePath: "lib/notifications/admin-notification-service.ts",
      importPath: "@/lib/notifications/admin-notification-service",
      entryPoints: [
        "loadAdminNotificationPage",
        "loadAdminNotificationMenuSummary",
        "markOwnedAdminNotificationRead",
        "markOwnedAdminNotificationsRead",
      ],
    }],
  ]);
  for (const privilegedFile of privilegedFiles) {
    const normalizedFile = privilegedFile.toString().replaceAll("\\", "/");
    const privilegedSource = await readFile(
      new URL(
        normalizedFile,
        new URL("app/admin/", sourceRoot),
      ),
      "utf8",
    );
    if (/requireAdmin\(\)/u.test(privilegedSource)) continue;

    const delegation = delegatedActions.get(normalizedFile);
    assert.ok(
      delegation,
      `${normalizedFile} has neither inline nor approved delegated authorization`,
    );
    assert.ok(privilegedSource.includes(`from "${delegation.importPath}"`));
    assert.doesNotMatch(privilegedSource, /firebase-admin|adminDb/u);

    const service = await source(delegation.servicePath);
    assert.match(service, /^import "server-only";/u);
    for (const entryPoint of delegation.entryPoints) {
      assert.match(privilegedSource, new RegExp(`\\b${entryPoint}\\(`, "u"));
      const entryStart = service.indexOf(
        `export async function ${entryPoint}(`,
      );
      assert.notEqual(entryStart, -1, `${entryPoint} is not exported`);
      const nextEntry = service.indexOf(
        "export async function ",
        entryStart + 1,
      );
      const entrySource = service.slice(
        entryStart,
        nextEntry === -1 ? undefined : nextEntry,
      );
      assert.match(
        entrySource,
        /await requireAdmin\(\)/u,
        `${entryPoint} must authorize before accessing admin data`,
      );
    }
  }
});

test("trusted provisioning requires an existing Auth user and explicit confirmation", async () => {
  const provisioning = await readFile(
    new URL("../../../scripts/provision-admin.ts", import.meta.url),
    "utf8",
  );
  assert.match(provisioning, /auth\.getUser\(uid\)/u);
  assert.match(provisioning, /PROVISION_FEASTA_ADMIN/u);
  assert.match(provisioning, /Refusing to replace an existing/u);
  assert.match(provisioning, /collection\("adminLogs"\)/u);
  assert.doesNotMatch(
    provisioning,
    /createUser\(|password\s*[:=]|serviceAccount|privateKey/u,
  );
});
