import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), getUser: vi.fn(), revoke: vi.fn(), read: vi.fn(),
  cookie: "session-cookie" as string | undefined,
  trusted: vi.fn(),
  phone: vi.fn(),
}));
vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: {verifySessionCookie: mocks.verify, getUser: mocks.getUser, revokeRefreshTokens: mocks.revoke},
  adminDb: {collection: () => ({doc: () => ({get: mocks.read})})},
}));
vi.mock("next/headers", () => ({cookies: async () => ({
  get: () => mocks.cookie ? {value: mocks.cookie} : undefined,
  has: () => Boolean(mocks.cookie),
})}));
vi.mock("@/lib/security/logging", () => ({logWebSecurityEvent: vi.fn()}));
vi.mock("@/lib/security/request", () => ({assertTrustedMutation: mocks.trusted, CSRF_COOKIE_NAME: "feasta_csrf"}));
vi.mock("@/lib/auth/phone-identity-server", async (original) => ({
  ...await original<typeof import("@/lib/auth/phone-identity-server")>(),
  requireServerPhoneIdentityOwnership: mocks.phone,
}));

import {AccountAccessError, getOptionalAccountContext, isInvalidSessionError} from "@/lib/auth/session";
import {GET} from "@/app/api/auth/session/invalid/route";
import {POST} from "@/app/api/auth/logout/route";
import {PhoneIdentityError} from "@/lib/auth/phone-identity-server";

function failure(code: string, message = code) { return Object.assign(new Error(message), {code}); }
const request = () => new Request("http://localhost/api/auth/session/invalid?returnTo=%2Fprovider", {
  headers: {cookie: "feasta_session=session-cookie"},
});

describe("session reliability", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cookie = "session-cookie";
    mocks.verify.mockResolvedValue({uid: "admin", email_verified: true});
    mocks.getUser.mockResolvedValue({uid: "admin", disabled: false, emailVerified: true});
    mocks.read.mockResolvedValue({exists: true, data: () => ({role: "admin", accountStatus: "active", isActive: true, isBlocked: false, email: null, isEmailVerified: true})});
    mocks.revoke.mockResolvedValue(undefined);
  });

  it("retains verified sessions and checks revocation", async () => {
    expect(await getOptionalAccountContext()).toMatchObject({uid: "admin", role: "admin"});
    expect(mocks.verify).toHaveBeenCalledWith("session-cookie", true);
    const response = await GET(request());
    expect(response.headers.get("location")).toBe("http://localhost/admin");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each(["auth/session-cookie-expired", "auth/session-cookie-revoked", "auth/user-disabled", "auth/user-not-found"])(
    "clears definitively invalid sessions: %s", async (code) => {
      mocks.verify.mockRejectedValue(failure(code));
      expect(await getOptionalAccountContext()).toBeNull();
      const response = await GET(request());
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("reason=session-expired");
      expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    },
  );

  it.each([failure("auth/internal-error"), failure("app/network-error"), failure("auth/argument-error", "Error fetching public keys for Google certs: unavailable"), failure("auth/invalid-credential")])(
    "preserves cookies and denies access on verification infrastructure failure: %s", async (error) => {
      mocks.verify.mockRejectedValue(error);
      await expect(getOptionalAccountContext()).rejects.toBe(error);
      const response = await GET(request());
      expect(response.status).toBe(503);
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(response.headers.get("location")).toBeNull();
    },
  );

  it.each(["Auth", "Firestore"])("propagates temporary %s account-read failures", async (backend) => {
    const error = failure("unavailable");
    (backend === "Auth" ? mocks.getUser : mocks.read).mockRejectedValue(error);
    await expect(getOptionalAccountContext()).rejects.toBe(error);
    expect((await GET(request())).headers.get("set-cookie")).toBeNull();
  });

  it("still rejects trusted-account policy failures and malformed cookies", () => {
    expect(isInvalidSessionError(new AccountAccessError("blocked_account"))).toBe(true);
    expect(isInvalidSessionError(failure("auth/argument-error", "Decoding Firebase session cookie failed. invalid JWT"))).toBe(true);
    expect(isInvalidSessionError(new Error("unknown failure"))).toBe(false);
  });

  it("does not disguise a phone-identity backend outage as an invalid account", async () => {
    mocks.read.mockResolvedValue({exists: true, data: () => ({role: "admin", isPhoneVerified: true})});
    const error = failure("unavailable");
    mocks.phone.mockRejectedValue(error);
    await expect(getOptionalAccountContext()).rejects.toBe(error);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("continues to reject an inconsistent verified phone identity", async () => {
    mocks.read.mockResolvedValue({exists: true, data: () => ({role: "admin", isPhoneVerified: true})});
    mocks.phone.mockRejectedValue(new PhoneIdentityError("inconsistent identity"));
    expect(await getOptionalAccountContext()).toBeNull();
    expect((await GET(request())).status).toBe(307);
  });

  it("successfully logs out only after revocation and clears the cookie", async () => {
    const response = await POST(request());
    expect(mocks.revoke).toHaveBeenCalledWith("admin");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({success: true});
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("allows logout of expired/revoked credentials", async () => {
    mocks.verify.mockRejectedValue(failure("auth/session-cookie-revoked"));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });

  it.each(["verification", "revocation"])("does not report logout success on temporary %s failure", async (stage) => {
    (stage === "verification" ? mocks.verify : mocks.revoke).mockRejectedValue(failure("auth/internal-error"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).not.toHaveProperty("success");
  });

  it("keeps CSRF rejection intact", async () => {
    mocks.trusted.mockImplementation(() => {throw new Error("Request denied");});
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
