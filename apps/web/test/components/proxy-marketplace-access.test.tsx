import {NextRequest} from "next/server";
import {describe, expect, it} from "vitest";

import {
  PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER,
  PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER,
  isPublicMarketplacePath,
  isPublicProviderMarketplacePath,
  isPublicProviderMarketplaceReturnPath,
  publicProviderIdFromPath,
} from "@/lib/customer/providers/provider-route-policy";
import {proxy} from "@/proxy";

describe("customer marketplace route access", () => {
  it("allows a guest through the exact marketplace pathname", () => {
    const response = proxy(new NextRequest(
      "https://feasta.test/customer/providers?service=catering",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get(
      `x-middleware-request-${PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER}`,
    )).toBe("1");
    expect(response.headers.get(
      `x-middleware-request-${PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER}`,
    )).toBe("/customer/providers?service=catering");
  });

  it("allows the exact package marketplace while protecting descendants", () => {
    const response = proxy(new NextRequest(
      "https://feasta.test/customer/packages?event=wedding",
    ));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(
      `x-middleware-request-${PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER}`,
    )).toBe("1");
    expect(response.headers.get(
      `x-middleware-request-${PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER}`,
    )).toBe("/customer/packages?event=wedding");
    expect(isPublicMarketplacePath("/customer/packages")).toBe(true);
    expect(isPublicMarketplacePath("/customer/packages/package-one"))
      .toBe(false);
  });

  it("allows one safe provider ID segment and preserves its return destination", () => {
    const response = proxy(new NextRequest(
      "https://feasta.test/customer/providers/provider-one?source=directory",
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get(
      `x-middleware-request-${PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER}`,
    )).toBe("1");
    expect(response.headers.get(
      `x-middleware-request-${PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER}`,
    )).toBe("/customer/providers/provider-one?source=directory");
  });

  it("distinguishes the directory, one detail segment, and deeper descendants", () => {
    expect(isPublicProviderMarketplacePath("/customer/providers")).toBe(true);
    expect(publicProviderIdFromPath("/customer/providers/provider-one")).toBe("provider-one");
    expect(isPublicProviderMarketplacePath("/customer/providers/provider-one")).toBe(true);
    expect(isPublicProviderMarketplacePath("/customer/providers/provider-one/packages")).toBe(false);
    expect(isPublicProviderMarketplacePath("/customer/providers/bad.id")).toBe(false);
    expect(isPublicProviderMarketplaceReturnPath(
      "/customer/providers/provider-one?source=directory",
    )).toBe(true);
    expect(isPublicProviderMarketplaceReturnPath("//evil.test/customer/providers")).toBe(false);
  });

  it("keeps customer siblings and unsupported marketplace child paths protected", () => {
    for (const pathname of [
      "/customer",
      "/customer/account",
      "/customer/bookings",
      "/customer/favorites",
      "/customer/notifications",
      "/customer/payments",
      "/customer/packages/package-one",
      "/customer/providers/provider-one/packages",
      "/customer/providers/bad.id",
    ]) {
      const response = proxy(new NextRequest(`https://feasta.test${pathname}`));
      expect(response.status, pathname).toBe(307);
      expect(new URL(response.headers.get("location")!).pathname, pathname).toBe("/login");
    }
  });

  it("preserves path and query in protected-route login redirects", () => {
    const response = proxy(new NextRequest(
      "https://feasta.test/customer/bookings?status=confirmed&q=summer",
    ));
    const login = new URL(response.headers.get("location")!);

    expect(login.searchParams.get("next")).toBe(
      "/customer/bookings?status=confirmed&q=summer",
    );
  });

  it("strips a caller-supplied marketplace marker from protected requests", () => {
    const response = proxy(new NextRequest(
      "https://feasta.test/customer/bookings",
      {
        headers: {
          cookie: "feasta_session=unverified-test-value",
          [PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER]: "1",
        },
      },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get(
      `x-middleware-request-${PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER}`,
    )).toBeNull();
    expect(response.headers.get(
      `x-middleware-request-${PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER}`,
    )).toBeNull();
    expect(response.headers.get("x-middleware-override-headers"))
      .not.toContain(PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER);
  });

  it("replaces spoofed public headers with canonical detail-route values", () => {
    const response = proxy(new NextRequest(
      "https://feasta.test/customer/providers/provider-one",
      {
        headers: {
          [PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER]: "forged",
          [PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER]: "https://evil.test/",
        },
      },
    ));

    expect(response.headers.get(
      `x-middleware-request-${PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER}`,
    )).toBe("1");
    expect(response.headers.get(
      `x-middleware-request-${PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER}`,
    )).toBe("/customer/providers/provider-one");
  });
});
