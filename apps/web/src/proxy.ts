import {NextRequest, NextResponse} from "next/server";
import {
  CUSTOMER_PAYMENT_RETURN_HEADER,
  isCustomerPaymentReturnPath,
} from "@/lib/customer/payments/payment-return-route-policy";

import {
  PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER,
  PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER,
  isPublicMarketplacePath,
} from "@/lib/customer/providers/provider-route-policy";

const PROTECTED_PREFIXES = ["/customer", "/provider", "/admin"];

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(CUSTOMER_PAYMENT_RETURN_HEADER);
  requestHeaders.delete(PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER);
  requestHeaders.delete(PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER);

  const paymentReturnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (isCustomerPaymentReturnPath(paymentReturnTo)) {
    requestHeaders.set(CUSTOMER_PAYMENT_RETURN_HEADER, paymentReturnTo);
  }

  if (isPublicMarketplacePath(request.nextUrl.pathname)) {
    const marketplaceReturnTo =
      `${request.nextUrl.pathname}${request.nextUrl.search}`;
    requestHeaders.set(PUBLIC_PROVIDER_MARKETPLACE_REQUEST_HEADER, "1");
    requestHeaders.set(
      PUBLIC_PROVIDER_MARKETPLACE_RETURN_HEADER,
      marketplaceReturnTo.length <= 1024
        ? marketplaceReturnTo
        : request.nextUrl.pathname,
    );
    return NextResponse.next({request: {headers: requestHeaders}});
  }

  const protectedPath = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname === prefix ||
    request.nextUrl.pathname.startsWith(`${prefix}/`),
  );
  if (protectedPath && !request.cookies.has("feasta_session")) {
    const path = request.nextUrl.pathname;
    const loginPath = path === "/provider" || path.startsWith("/provider/")
      ? "/provider-login"
      : path === "/admin" || path.startsWith("/admin/")
        ? "/admin-login"
        : "/login";
    const login = new URL(loginPath, request.url);
    login.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(login);
  }
  return NextResponse.next({request: {headers: requestHeaders}});
}

export const config = {
  matcher: ["/customer/:path*", "/provider/:path*", "/admin/:path*"],
};
