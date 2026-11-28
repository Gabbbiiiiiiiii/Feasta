import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), getUser: vi.fn(), revoke: vi.fn(), read: vi.fn(),
  cookie: "session-cookie" as string | undefined,
  trusted: vi.fn(),
  phone: vi.fn(),
  redirect: vi.fn((path: string) => {throw new Error(path);}),
  headers: new Headers(),
}));
vi.mock("@/lib/service-categories/service-category-service", () => ({getActiveServiceCategoryOptions: async () => []}));
vi.mock("@/lib/auth/account-management", () => ({loadAccountManagementProfile: async () => null}));
vi.mock("@/components/customer/layout/customer-marketplace-shell", () => ({CustomerMarketplaceShell: () => null}));
vi.mock("@/components/customer/layout/public-provider-marketplace-shell", () => ({PublicProviderMarketplaceShell: () => null}));
vi.mock("next/navigation", () => ({redirect: mocks.redirect}));
vi.mock("@/lib/firebase/admin", () => ({
  adminAuth: {verifySessionCookie: mocks.verify, getUser: mocks.getUser, revokeRefreshTokens: mocks.revoke},
  adminDb: {collection: () => ({doc: () => ({get: mocks.read})})},
}));
vi.mock("next/headers", () => ({headers: async () => mocks.headers, cookies: async () => ({
  get: () => mocks.cookie ? {value: mocks.cookie} : undefined,
  has: () => Boolean(mocks.cookie),
})}));
vi.mock("@/lib/security/logging", () => ({logWebSecurityEvent: vi.fn()}));
vi.mock("@/lib/security/request", () => ({assertTrustedMutation: mocks.trusted, CSRF_COOKIE_NAME: "feasta_csrf"}));
vi.mock("@/lib/auth/phone-identity-server", async (original) => ({
  ...await original<typeof import("@/lib/auth/phone-identity-server")>(),
  requireServerPhoneIdentityOwnership: mocks.phone,
}));

import {AccountAccessError, getOptionalAccountContext, isInvalidSessionError, requireCustomer} from "@/lib/auth/session";
import {GET} from "@/app/api/auth/session/invalid/route";
import {POST} from "@/app/api/auth/logout/route";
import {PhoneIdentityError} from "@/lib/auth/phone-identity-server";
import CustomerLayout from "@/app/customer/layout";
import {NextRequest} from "next/server";
import {proxy} from "@/proxy";
import {CUSTOMER_PAYMENT_RETURN_HEADER, isCustomerPaymentReturnPath} from "@/lib/customer/payments/payment-return-route-policy";

function failure(code: string, message = code) { return Object.assign(new Error(message), {code}); }
const request = () => new Request("http://localhost/api/auth/session/invalid?returnTo=%2Fprovider", {
  headers: {cookie: "feasta_session=session-cookie"},
});

describe("session reliability", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.cookie = "session-cookie";
    mocks.headers = new Headers();
    mocks.verify.mockResolvedValue({uid: "admin", email_verified: true});
    mocks.getUser.mockResolvedValue({uid: "admin", disabled: false, emailVerified: true});
    mocks.read.mockResolvedValue({exists: true, data: () => ({role: "admin", accountStatus: "active", isActive: true, isBlocked: false, email: null, isEmailVerified: true})});
    mocks.revoke.mockResolvedValue(undefined);
  });

  it.each(["success", "cancelled", "canceled"])("preserves %s through the actual expired-session layout boundary", async (kind) => {
    const path = `/customer/payments?payment=${kind}&ref=payment_12345678`;
    const response = proxy(new NextRequest(`https://feasta-web.vercel.app${path}`, {
      headers: {cookie: "feasta_session=expired", [CUSTOMER_PAYMENT_RETURN_HEADER]: "/customer/payments?payment=success&ref=spoofed"},
    }));
    const forwarded = response.headers.get(`x-middleware-request-${CUSTOMER_PAYMENT_RETURN_HEADER}`);
    expect(forwarded).toBe(path);
    mocks.headers.set(CUSTOMER_PAYMENT_RETURN_HEADER, forwarded!);
    mocks.verify.mockRejectedValue(failure("auth/session-cookie-expired"));
    await expect(CustomerLayout({children: null})).rejects.toThrow();
    expect(mocks.redirect).toHaveBeenLastCalledWith(`/api/auth/session/invalid?returnTo=${encodeURIComponent(path)}`);
  });

  it("preserves the return at the actual layout boundary even without a cookie", async () => {
    mocks.cookie = undefined;
    const path = "/customer/payments?payment=success&ref=payment_12345678";
    mocks.headers.set(CUSTOMER_PAYMENT_RETURN_HEADER, path);
    await expect(CustomerLayout({children: null})).rejects.toThrow();
    expect(mocks.redirect).toHaveBeenLastCalledWith(`/login?next=${encodeURIComponent(path)}`);
  });

  it("renders the actual layout for a valid customer payment return", async () => {
    mocks.headers.set(CUSTOMER_PAYMENT_RETURN_HEADER, "/customer/payments?payment=success&ref=payment_12345678");
    mocks.read.mockResolvedValue({exists: true, data: () => ({role: "customer", accountStatus: "active", isActive: true, isBlocked: false, email: null, isEmailVerified: true})});
    expect(await CustomerLayout({children: null})).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["/customer/bookings", "/provider/bookings", "/admin/payments"])("strips spoofed payment headers on %s", (path) => {
    const response = proxy(new NextRequest(`https://feasta-web.vercel.app${path}`, {
      headers: {cookie: "feasta_session=valid", [CUSTOMER_PAYMENT_RETURN_HEADER]: "/customer/payments?payment=success&ref=spoofed"},
    }));
    expect(response.headers.get(`x-middleware-request-${CUSTOMER_PAYMENT_RETURN_HEADER}`)).toBeNull();
    expect(response.headers.get("location")).toBeNull();
  });

  it.each([
    "https://evil.test/customer/payments?payment=success", "//evil.test?payment=success",
    "/customer/payments/other?payment=success", "/customer/payments?payment=success&ref=%5cevil",
    "/customer/payments?payment=success&ref=%0d%0aevil", "/customer/payments?payment=success#evil",
    `/customer/payments?payment=success&ref=${"a".repeat(1024)}`,
  ])("rejects unsafe or out-of-scope layout return %s", async (path) => {
    expect(isCustomerPaymentReturnPath(path)).toBe(false);
    mocks.headers.set(CUSTOMER_PAYMENT_RETURN_HEADER, path);
    mocks.cookie = undefined;
    await expect(CustomerLayout({children: null})).rejects.toThrow();
    expect(mocks.redirect).toHaveBeenLastCalledWith("/login");
  });

  it("keeps other customer layout authentication unchanged after proxy strips spoofing", async () => {
    const response = proxy(new NextRequest("https://feasta-web.vercel.app/customer/bookings", {
      headers: {cookie: "feasta_session=expired", [CUSTOMER_PAYMENT_RETURN_HEADER]: "/customer/payments?payment=success"},
    }));
    expect(response.headers.get(`x-middleware-request-${CUSTOMER_PAYMENT_RETURN_HEADER}`)).toBeNull();
    mocks.verify.mockRejectedValue(failure("auth/session-cookie-expired"));
    await expect(CustomerLayout({children: null})).rejects.toThrow();
    expect(mocks.redirect).toHaveBeenLastCalledWith("/api/auth/session/invalid?returnTo=%2Flogin");
  });

  it.each(["success", "cancelled"])("preserves the %s payment return through expired-session cleanup", async (kind) => {
    const returnTo = `/customer/payments?payment=${kind}&ref=payment_12345678`;
    mocks.verify.mockRejectedValue(failure("auth/session-cookie-expired"));
    await expect(requireCustomer({returnTo})).rejects.toThrow();
    expect(mocks.redirect).toHaveBeenLastCalledWith(
      `/api/auth/session/invalid?returnTo=${encodeURIComponent(returnTo)}`,
    );
    const response = await GET(new Request(
      `https://feasta-web.vercel.app/api/auth/session/invalid?returnTo=${encodeURIComponent(returnTo)}`,
      {headers: {cookie: "feasta_session=expired"}},
    ));
    const login = new URL(response.headers.get("location")!);
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("next")).toBe(returnTo);
    expect(login.searchParams.get("reason")).toBe("session-expired");
  });

  it.each(["https://evil.test", "//evil.test", "/%5cevil.test", "/%0d%0aevil"])("rejects unsafe return destination %s", async (returnTo) => {
    mocks.verify.mockRejectedValue(failure("auth/session-cookie-expired"));
    const response = await GET(new Request(
      `https://feasta-web.vercel.app/api/auth/session/invalid?returnTo=${encodeURIComponent(returnTo)}`,
    ));
    const login = new URL(response.headers.get("location")!);
    expect(login.origin).toBe("https://feasta-web.vercel.app");
    expect(login.searchParams.has("next")).toBe(false);
  });

  it("does not send a valid admin session to a customer return route", async () => {
    const response = await GET(new Request(
      "https://feasta-web.vercel.app/api/auth/session/invalid?returnTo=%2Fcustomer%2Fpayments%3Fpayment%3Dsuccess",
      {headers: {cookie: "feasta_session=valid"}},
    ));
    expect(response.headers.get("location")).toBe("https://feasta-web.vercel.app/admin");
  });

  it("retains a valid customer's payment destination during cleanup recovery", async () => {
    mocks.read.mockResolvedValue({exists: true, data: () => ({role: "customer", accountStatus: "active", isActive: true, isBlocked: false, email: null, isEmailVerified: true})});
    const returnTo = "/customer/payments?payment=success&ref=payment_12345678";
    expect(await requireCustomer({returnTo})).toMatchObject({role: "customer"});
    expect(mocks.redirect).not.toHaveBeenCalled();
    const response = await GET(new Request(
      `https://feasta-web.vercel.app/api/auth/session/invalid?returnTo=${encodeURIComponent(returnTo)}`,
      {headers: {cookie: "feasta_session=valid"}},
    ));
    expect(response.headers.get("location")).toBe(`https://feasta-web.vercel.app${returnTo}`);
    expect(response.headers.get("set-cookie")).toBeNull();
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
