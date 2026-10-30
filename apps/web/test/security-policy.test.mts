import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync, readdirSync, statSync} from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

import {
  configuredAllowedOrigins,
  isAllowedOrigin,
  isSafeRelativeReturnTo,
  isRoleAllowed,
  parseCookie,
  sessionCookiePolicy,
  verifyRevocationAwareSession,
} from "../src/lib/security/policy.ts";

test("same-origin mutations are accepted and disallowed origins are rejected", () => {
  const allowed = configuredAllowedOrigins("https://feasta.example,http://localhost:3000");
  assert.equal(isAllowedOrigin("https://feasta.example", allowed), true);
  assert.equal(isAllowedOrigin("https://evil.example", allowed), false);
  assert.equal(isAllowedOrigin(null, allowed), false);
  assert.equal(isAllowedOrigin("https://feasta.example/path", allowed), false);
});

test("external and protocol-relative redirects are rejected", () => {
  assert.equal(isSafeRelativeReturnTo("/customer/bookings"), true);
  assert.equal(isSafeRelativeReturnTo("https://evil.example"), false);
  assert.equal(isSafeRelativeReturnTo("//evil.example"), false);
  assert.equal(isSafeRelativeReturnTo("/\\evil.example"), false);
  assert.equal(isSafeRelativeReturnTo("/%2f%2fevil.example"), false);
  assert.equal(isSafeRelativeReturnTo("/%5cevil.example"), false);
});

test("production session cookies have required security flags", () => {
  assert.deepEqual(sessionCookiePolicy(true, 300), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });
});

test("cookie parsing fails closed for malformed values", () => {
  assert.equal(parseCookie("other=x; feasta_csrf=token%201", "feasta_csrf"), "token 1");
  assert.equal(parseCookie("feasta_csrf=%E0%A4%A", "feasta_csrf"), null);
  assert.equal(parseCookie(null, "feasta_csrf"), null);
});

test("client modules do not import Firebase Admin or server admin modules", () => {
  const sourceRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src",
  );
  for (const file of walk(sourceRoot)) {
    const source = readFileSync(file, "utf8");
    if (!source.startsWith('"use client"') && !source.startsWith("'use client'")) continue;
    assert.doesNotMatch(source, /firebase-admin|lib\/firebase\/admin/);
  }
});

test("expired and revoked session failures propagate and checks are revocation-aware", async () => {
  for (const code of ["auth/session-cookie-expired", "auth/id-token-revoked"]) {
    let checkRevoked: boolean | undefined;
    await assert.rejects(
      verifyRevocationAwareSession("signed-cookie", async (_value, check) => {
        checkRevoked = check;
        throw Object.assign(new Error(code), {code});
      }),
      (error: unknown) => (error as {code?: string}).code === code,
    );
    assert.equal(checkRevoked, true);
  }
});

test("revocation checks may be relaxed only when explicitly requested", async () => {
  let checkRevoked: boolean | undefined;
  await verifyRevocationAwareSession(
    "signed-cookie",
    async (_value, check) => {
      checkRevoked = check;
      return {uid: "customer-one"};
    },
    false,
  );
  assert.equal(checkRevoked, false);
});

test("missing and tampered session cookies are denied", async () => {
  await assert.rejects(
    verifyRevocationAwareSession("", async () => ({uid: "never"})),
    /missing/u,
  );
  await assert.rejects(
    verifyRevocationAwareSession("tampered", async () => {
      throw Object.assign(new Error("invalid cookie"), {
        code: "auth/argument-error",
      });
    }),
    (error: unknown) =>
      (error as {code?: string}).code === "auth/argument-error",
  );
});

test("customer and provider roles are denied from admin authorization", () => {
  assert.equal(isRoleAllowed("customer", ["admin"]), false);
  assert.equal(isRoleAllowed("provider", ["admin"]), false);
  assert.equal(isRoleAllowed("admin", ["admin"]), true);
  assert.equal(isRoleAllowed("provider", ["provider"]), true);
  assert.equal(isRoleAllowed("customer", ["customer"]), true);
});

test("route layouts enforce their server-side role", () => {
  const appRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../src/app",
  );
  for (const [route, helper] of [
    ["admin", "requireAdmin"],
    ["provider", "requireProvider"],
    ["customer", "requireCustomer"],
  ]) {
    const layout = readFileSync(path.join(appRoot, route, "layout.tsx"), "utf8");
    assert.match(layout, new RegExp(`${helper}\\(\\)`));
  }
});

test("session creation preserves origin, CSRF, rate-limit, and fixation controls", () => {
  const route = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/app/api/auth/session/route.ts",
    ),
    "utf8",
  );
  const trustedMutation = route.indexOf("assertTrustedMutation(request)");
  const rateLimit = route.indexOf("enforceSessionCreationRateLimit(request)");
  const create = route.indexOf("createSession(body.idToken)");
  assert.ok(trustedMutation >= 0 && trustedMutation < rateLimit);
  assert.ok(rateLimit < create);
  assert.match(route, /response\.cookies\.set\(SESSION_COOKIE_NAME/u);
  assert.match(route, /Sign-in could not be completed\./u);
  assert.doesNotMatch(route, /error\.message.*401|idToken.*console/u);
});

test("trusted account loading checks Auth state and provider ownership", () => {
  const session = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/lib/auth/session.ts",
    ),
    "utf8",
  );
  assert.match(session, /adminAuth\.verifyIdToken\(idToken, true\)/u);
  assert.match(session, /adminAuth\.getUser\(uid\)/u);
  assert.match(session, /collection\("users"\)/u);
  assert.match(session, /collection\("customers"\)/u);
  assert.match(session, /collection\("providers"\)/u);
  assert.match(session, /resolveTrustedAccountContext/u);
});

test("invalid-session endpoint never clears a verified session", () => {
  const route = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/app/api/auth/session/invalid/route.ts",
    ),
    "utf8",
  );
  assert.ok(route.indexOf("verifySessionCookie(cookie)") <
    route.indexOf("destroySession(response)"));
  assert.match(route, /homeForAccount\(account\)/u);
  assert.match(route, /isSafeRelativeReturnTo/u);
});

test("session rate limiting is persistent and transaction-safe", () => {
  const rateLimit = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/lib/security/session-rate-limit.ts",
    ),
    "utf8",
  );
  assert.match(rateLimit, /adminDb\.runTransaction/u);
  assert.match(rateLimit, /collection\("rateLimits"\)/u);
  assert.match(rateLimit, /Retry|retryAfterSeconds/u);
  assert.doesNotMatch(rateLimit, /new Map|setInterval/u);
});

test("CSP denies unexpected script origins and dangerous object embedding", () => {
  const config = readFileSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../next.config.ts"),
    "utf8",
  );
  assert.match(config, /"object-src 'none'"/u);
  assert.match(config, /"frame-ancestors 'none'"/u);
  assert.doesNotMatch(config, /evil\.example|script-src \*/u);
});

test("web security logging contains identifiers but no credential fields", () => {
  const logging = readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/lib/security/logging.ts",
    ),
    "utf8",
  );
  assert.match(logging, /correlationId/u);
  assert.match(logging, /actorUid/u);
  assert.doesNotMatch(
    logging,
    /idToken|sessionCookie|authorization|privateKey|password/u,
  );
});

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const item = path.join(directory, name);
    return statSync(item).isDirectory() ? walk(item) : [item];
  }).filter((file) => /\.[cm]?[jt]sx?$/.test(file));
}
