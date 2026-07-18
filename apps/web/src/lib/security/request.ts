import "server-only";

import {randomBytes, timingSafeEqual} from "node:crypto";

import {
  configuredAllowedOrigins,
  isAllowedOrigin,
  parseCookie,
} from "./policy";

export const CSRF_COOKIE_NAME = "feasta_csrf";
export const CSRF_HEADER_NAME = "x-feasta-csrf";

export const csrfCookieOptions = {
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 60 * 60,
};

export function createCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function assertTrustedMutation(request: Request): void {
  const allowedOrigins = configuredAllowedOrigins(process.env.WEB_ALLOWED_ORIGINS);
  const origin = request.headers.get("origin");

  if (!isAllowedOrigin(origin, allowedOrigins)) {
    throw new Error("Request origin is not allowed.");
  }

  const cookieToken = parseCookie(request.headers.get("cookie"), CSRF_COOKIE_NAME);
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (!cookieToken || !headerToken || !constantTimeEqual(cookieToken, headerToken)) {
    throw new Error("CSRF validation failed.");
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer);
}

