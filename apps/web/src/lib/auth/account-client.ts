"use client";

import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import {httpsCallable} from "firebase/functions";
import {
  authenticationGatePresentation,
  type UserRole,
} from "@feasta/shared-types";

import {
  authorizeWebAuthenticationAttempt,
  logoutWebSession,
  WebAuthenticationError,
} from "@/lib/auth/client-session";
import {auth, functions} from "@/lib/firebase/client";

export type AccountPreferencesInput = {
  marketingConsent: boolean;
  pushNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
};

export async function updateAccountProfile(
  role: UserRole,
  values: Record<string, string>,
): Promise<void> {
  await call(
    role === "customer" ? "updateCustomerProfile" : "updateRoleAccountProfile",
    values,
  );
}

export async function updateAccountPreferences(
  values: AccountPreferencesInput,
): Promise<void> {
  await call("updateAccountPreferences", values);
}

export async function changeAccountPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await authorizeWebAuthenticationAttempt("password_change");
  const user = await reauthenticatePassword(currentPassword);
  await updatePassword(user, newPassword);
  await user.getIdToken(true);
  await call("revokeAllAccountSessions", {});
  await logoutWebSession();
}

export async function requestAccountEmailUpdate(
  currentPassword: string,
  newEmail: string,
): Promise<void> {
  await authorizeWebAuthenticationAttempt("email_update");
  const user = await reauthenticatePassword(currentPassword);
  await verifyBeforeUpdateEmail(user, newEmail.trim().toLowerCase());
}

export async function deactivateWebAccount(
  role: UserRole,
  reason: string,
  currentPassword?: string,
): Promise<void> {
  if (role === "admin") {
    throw new WebAuthenticationError(
      "Admin self-deactivation requires another authorized administrator.",
      "forbidden",
    );
  }
  await reauthenticateSensitive(currentPassword);
  await call(
    role === "customer"
      ? "deactivateCustomerAccount"
      : "deactivateProviderAccount",
    {reason: reason.trim()},
  );
  await logoutWebSession();
}

export async function revokeAllWebAccountSessions(
  currentPassword?: string,
): Promise<void> {
  await authorizeWebAuthenticationAttempt("logout_all");
  await reauthenticateSensitive(currentPassword);
  await call("revokeAllAccountSessions", {});
  await logoutWebSession();
}

export {logoutWebSession};

async function reauthenticatePassword(currentPassword: string) {
  const user = requireUser();
  const email = user.email;
  const hasPasswordProvider = user.providerData.some(
    (provider) => provider.providerId === "password",
  );
  if (!email || !hasPasswordProvider) {
    throw new WebAuthenticationError(
      "This account uses an external identity provider.",
      "password_provider_required",
    );
  }
  await reauthenticateWithCredential(
    user,
    EmailAuthProvider.credential(email, currentPassword),
  );
  await user.getIdToken(true);
  return user;
}

async function reauthenticateSensitive(currentPassword?: string) {
  const user = requireUser();
  if (user.providerData.some((provider) => provider.providerId === "password")) {
    return reauthenticatePassword(currentPassword ?? "");
  }
  if (user.providerData.some((provider) => provider.providerId === "google.com")) {
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
    await user.getIdToken(true);
    return user;
  }
  throw new WebAuthenticationError(
    "Reauthenticate with your identity provider before continuing.",
    "recent_login_required",
  );
}

function requireUser() {
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      authenticationGatePresentation("sessionExpired").message,
      "session_expired",
    );
  }
  return auth.currentUser;
}

async function call(
  name: string,
  data: Record<string, unknown>,
): Promise<void> {
  await httpsCallable<Record<string, unknown>, unknown>(
    functions,
    name,
  )(data);
}
