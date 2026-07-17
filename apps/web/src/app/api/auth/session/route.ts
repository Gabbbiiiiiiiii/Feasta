import {NextResponse} from "next/server";

import {
  createVerifiedSession,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await request.json() as {idToken?: unknown};
    if (typeof body.idToken !== "string" || body.idToken.length < 100) {
      return NextResponse.json({error: "ID token is required."}, {status: 400});
    }

    const {cookie, user} = await createVerifiedSession(body.idToken);
    const response = NextResponse.json({role: user.role});
    response.cookies.set(SESSION_COOKIE_NAME, cookie, sessionCookieOptions);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in failed.";
    return NextResponse.json({error: message}, {status: 401});
  }
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    throw new Error("Cross-origin session requests are not allowed.");
  }
}
