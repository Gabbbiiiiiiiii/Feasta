import {NextResponse} from "next/server";

import {
  createCsrfToken,
  CSRF_COOKIE_NAME,
  csrfCookieOptions,
} from "@/lib/security/request";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = createCsrfToken();
  const response = NextResponse.json({token});
  response.cookies.set(CSRF_COOKIE_NAME, token, csrfCookieOptions);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

