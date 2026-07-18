import {NextRequest, NextResponse} from "next/server";

const PROTECTED_PREFIXES = ["/customer", "/provider", "/admin"];

export function proxy(request: NextRequest) {
  const protectedPath = PROTECTED_PREFIXES.some((prefix) =>
    request.nextUrl.pathname === prefix ||
    request.nextUrl.pathname.startsWith(`${prefix}/`),
  );
  if (protectedPath && !request.cookies.has("feasta_session")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/customer/:path*", "/provider/:path*", "/admin/:path*"],
};
