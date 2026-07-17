import "server-only";

import {cookies} from "next/headers";
import {redirect} from "next/navigation";

import {adminAuth, adminDb} from "@/lib/firebase/admin";

export const SESSION_COOKIE_NAME = "__session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5;

export const USER_ROLES = ["customer", "provider", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface SessionUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  role: UserRole;
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

export async function createVerifiedSession(idToken: string): Promise<{
  cookie: string;
  user: SessionUser;
}> {
  const decoded = await adminAuth.verifyIdToken(idToken, true);
  const nowSeconds = Math.floor(Date.now() / 1000);

  if (nowSeconds - decoded.auth_time > 5 * 60) {
    throw new Error("Recent sign-in is required.");
  }

  const user = await loadActiveUser(
    decoded.uid,
    decoded.email ?? null,
    decoded.email_verified === true,
  );
  const cookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
  });
  return {cookie, user};
}

export async function verifySessionCookie(
  sessionCookie: string,
): Promise<SessionUser> {
  const decoded = await adminAuth.verifySessionCookie(sessionCookie, true);
  return loadActiveUser(
    decoded.uid,
    decoded.email ?? null,
    decoded.email_verified === true,
  );
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!value) return null;

  try {
    return await verifySessionCookie(value);
  } catch {
    return null;
  }
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(
  allowedRoles: readonly UserRole[],
): Promise<SessionUser> {
  const user = await requireSessionUser();
  if (!allowedRoles.includes(user.role)) redirect("/unauthorized");
  return user;
}

async function loadActiveUser(
  uid: string,
  email: string | null,
  emailVerified: boolean,
): Promise<SessionUser> {
  const snapshot = await adminDb.collection("users").doc(uid).get();
  const data = snapshot.data();

  if (!snapshot.exists || !data) throw new Error("User profile not found.");
  if (!USER_ROLES.includes(data.role as UserRole)) {
    throw new Error("User role is invalid.");
  }
  if (
    data.accountStatus !== "active" ||
    data.isActive === false ||
    data.isBlocked === true
  ) {
    throw new Error("Account is blocked or disabled.");
  }

  return {
    uid,
    email,
    emailVerified,
    role: data.role as UserRole,
  };
}
