import {NextRequest} from "next/server";
import {describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({requireCustomer: vi.fn(), load: vi.fn()}));
vi.mock("@/lib/auth/session", () => ({requireCustomer: mocks.requireCustomer}));
vi.mock("@/lib/customer/payments/customer-payment-service", () => ({getCustomerPaymentPage: mocks.load}));
vi.mock("@/components/customer/payments/customer-payments-client", () => ({CustomerPaymentsClient: () => null}));

import CustomerPaymentsPage from "@/app/customer/payments/page";
import {proxy} from "@/proxy";

describe("payment return routing", () => {
  it.each(["success", "cancelled", "canceled"])("preserves %s context at the page authentication boundary", async (payment) => {
    mocks.requireCustomer.mockResolvedValue({uid: "customer", role: "customer"});
    mocks.load.mockResolvedValue({});
    await CustomerPaymentsPage({searchParams: Promise.resolve({payment, ref: "payment_12345678", extra: ["one", "two"]})});
    expect(mocks.requireCustomer).toHaveBeenLastCalledWith({
      returnTo: `/customer/payments?payment=${payment}&ref=payment_12345678&extra=one&extra=two`,
    });
  });

  it.each(["success", "cancelled"])("preserves %s context when no production cookie exists", (payment) => {
    const path = `/customer/payments?payment=${payment}&ref=payment_12345678`;
    const response = proxy(new NextRequest(`https://feasta-web.vercel.app${path}`));
    const login = new URL(response.headers.get("location")!);
    expect(login.origin).toBe("https://feasta-web.vercel.app");
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("next")).toBe(path);
  });

  it("lets a cookie-bearing production return reach server verification", () => {
    const response = proxy(new NextRequest(
      "https://feasta-web.vercel.app/customer/payments?payment=success&ref=payment_12345678",
      {headers: {cookie: "feasta_session=requires-server-verification"}},
    ));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
