import {NextResponse} from "next/server";

import {adminAuth} from "@/lib/firebase/admin";
import {
  SESSION_COOKIE_NAME,
  verifySessionCookie,
} from "@/lib/auth/session";

export async function POST(request: Request) {
  const value = request.headers.get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

  if (value) {
    try {
      const user = await verifySessionCookie(decodeURIComponent(value));
      await adminAuth.revokeRefreshTokens(user.uid);
    } catch {
      // Expired/revoked cookies are cleared just like valid cookies.
    }
  }

  const response = NextResponse.json({success: true});
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
