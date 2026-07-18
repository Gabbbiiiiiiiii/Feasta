import "server-only";

import {
  parseAccountStatus,
  parseUserRole,
  type UserRole,
} from "@feasta/shared-types";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";

import {adminAuth, adminDb} from "@/lib/firebase/admin";
import {
  sessionCookiePolicy,
  verifyRevocationAwareSession,
  isRoleAllowed,
} from "@/lib/security/policy";
import {logWebSecurityEvent} from "@/lib/security/logging";
import type {ServerAccountContext} from "@/lib/auth/account-context";

export const SESSION_COOKIE_NAME = "feasta_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5;

export type {UserRole} from "@feasta/shared-types";
export type SessionUser = ServerAccountContext;

export const sessionCookieOptions = sessionCookiePolicy(
  process.env.NODE_ENV === "production",
  SESSION_MAX_AGE_SECONDS,
);

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
  const decoded = await verifyRevocationAwareSession(
    sessionCookie,
    (value, checkRevoked) => adminAuth.verifySessionCookie(value, checkRevoked),
  );
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
    logWebSecurityEvent({
      action: "session_access_denied",
      outcome: "denied",
      reasonCode: "invalid_expired_or_revoked_session",
    });
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
  if (!isRoleAllowed(user.role, allowedRoles)) {
    logWebSecurityEvent({
      action: "role_access_denied",
      outcome: "denied",
      actorUid: user.uid,
      targetId: allowedRoles.join(","),
      reasonCode: "role_not_allowed",
    });
    redirect("/unauthorized");
  }
  return user;
}

async function loadActiveUser(
  uid: string,
  email: string | null,
  emailVerified: boolean,
): Promise<SessionUser> {
  const snapshot = await adminDb.collection("users").doc(uid).get();
  const data = snapshot.data();

  if (!snapshot.exists || !data) {
    logWebSecurityEvent({
      action: "account_access_denied",
      outcome: "denied",
      actorUid: uid,
      targetId: uid,
      reasonCode: "profile_missing",
    });
    throw new Error("User profile not found.");
  }
  const role = parseUserRole(data.role);
  const accountStatus = parseAccountStatus(data.accountStatus);
  if (!role || !accountStatus) {
    logWebSecurityEvent({
      action: "role_access_denied",
      outcome: "denied",
      actorUid: uid,
      targetId: uid,
      reasonCode: "invalid_role",
    });
    throw new Error("User role is invalid.");
  }
  if (
    accountStatus !== "active" ||
    data.isActive !== true ||
    data.isBlocked !== false
  ) {
    logWebSecurityEvent({
      action: "account_access_denied",
      outcome: "denied",
      actorUid: uid,
      targetId: uid,
      reasonCode: data.isBlocked === true ? "account_blocked" :
        "account_inactive",
    });
    throw new Error("Account is blocked or disabled.");
  }

  return {
    uid,
    email,
    emailVerified,
    role,
    accountStatus,
    isActive: data.isActive === true,
    isBlocked: data.isBlocked === true,
    isPhoneVerified: data.isPhoneVerified === true,
    providerId: typeof data.providerId === "string" && data.providerId.length > 0
      ? data.providerId
      : null,
  };
}
