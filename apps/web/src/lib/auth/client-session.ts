"use client";

import {
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  browserSessionPersistence,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  verifyPasswordResetCode,
  type User,
} from "firebase/auth";
import {httpsCallable} from "firebase/functions";
import type {UserRole} from "@feasta/shared-types";

import {auth, functions} from "@/lib/firebase/client";

export type WebUserRole = UserRole;
export type WebAuthenticationAttemptAction =
  | "customer_registration"
  | "provider_registration"
  | "password_reset"
  | "email_verification_resend"
  | "email_update"
  | "password_change"
  | "logout_all";

export type WebSessionResult = {
  role: WebUserRole;
  destination: string;
};

export type CustomerRegistrationInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  acceptedTerms: true;
  acceptedPrivacy: true;
};

export class WebAuthenticationError extends Error {
  constructor(
    message: string,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "WebAuthenticationError";
  }
}

export async function signInWithEmail(
  email: string,
  password: string,
  returnTo?: string,
): Promise<WebSessionResult> {
  await setPersistence(auth, browserSessionPersistence);
  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim().toLowerCase(),
    password,
  );
  try {
    // Repairs only absent customer records. The callable rejects an existing
    // provider/admin role, blocked state, or inactive account.
    await ensureCustomerProfile({});
    return await exchangeCredentialForSession(
      await credential.user.getIdToken(true),
      returnTo,
      "customer",
    );
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

export async function signInWithGoogle(
  returnTo?: string,
): Promise<WebSessionResult> {
  await setPersistence(auth, browserSessionPersistence);
  const credential = await signInWithPopup(auth, new GoogleAuthProvider());
  try {
    await ensureCustomerProfile({
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    return await exchangeCredentialForSession(
      await credential.user.getIdToken(true),
      returnTo,
      "customer",
    );
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

export async function registerCustomer(
  input: CustomerRegistrationInput,
): Promise<{verificationEmailSent: boolean}> {
  await authorizeWebAuthenticationAttempt(
    "customer_registration",
    input.email,
  );
  await setPersistence(auth, browserSessionPersistence);
  const credential = await createUserWithEmailAndPassword(
    auth,
    input.email.trim().toLowerCase(),
    input.password,
  );

  try {
    await ensureCustomerProfile({
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      acceptedTerms: input.acceptedTerms,
      acceptedPrivacy: input.acceptedPrivacy,
    });
  } catch (error) {
    await deleteUser(credential.user).catch(() => undefined);
    throw error;
  }

  try {
    await sendEmailVerification(credential.user);
    return {verificationEmailSent: true};
  } catch {
    // The trusted profiles already exist. The verification page provides a
    // retry action rather than deleting a usable partial registration.
    return {verificationEmailSent: false};
  }
}

export async function resendCurrentUserVerification(): Promise<void> {
  await authorizeWebAuthenticationAttempt("email_verification_resend");
  const user = requireCurrentUser();
  await sendEmailVerification(user);
}

export async function refreshCurrentUserVerification(
  returnTo?: string,
): Promise<{verified: boolean; destination?: string}> {
  const user = requireCurrentUser();
  await reload(user);
  if (!user.emailVerified) return {verified: false};
  const session = await exchangeCredentialForSession(
    await user.getIdToken(true),
    returnTo,
    "customer",
  );
  return {verified: true, destination: session.destination};
}

export async function requestPasswordReset(email: string): Promise<void> {
  await authorizeWebAuthenticationAttempt("password_reset", email);
  await sendPasswordResetEmail(auth, email.trim().toLowerCase());
}

export async function inspectPasswordResetCode(code: string): Promise<string> {
  return verifyPasswordResetCode(auth, code);
}

export async function completePasswordReset(
  code: string,
  password: string,
): Promise<void> {
  await confirmPasswordReset(auth, code, password);
}

export async function applyEmailActionCode(code: string): Promise<void> {
  await applyActionCode(auth, code);
}

export function currentUserEmail(): string | null {
  return auth.currentUser?.email ?? null;
}

export async function exchangeCurrentUserForSession(
  expectedRole: WebUserRole,
  returnTo?: string,
): Promise<WebSessionResult> {
  const user = requireCurrentUser();
  return exchangeCredentialForSession(
    await user.getIdToken(true),
    returnTo,
    expectedRole,
  );
}

export async function logoutWebSession(): Promise<void> {
  const csrf = await getCsrfToken();
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: {"x-feasta-csrf": csrf},
  });
  await signOut(auth);
}

export async function authorizeWebAuthenticationAttempt(
  action: WebAuthenticationAttemptAction,
  identifier?: string,
): Promise<void> {
  const csrf = await getCsrfToken();
  const requiresAuthentication = ![
    "customer_registration",
    "provider_registration",
    "password_reset",
  ].includes(action);
  const idToken = requiresAuthentication
    ? await requireCurrentUser().getIdToken()
    : undefined;
  const response = await fetch("/api/auth/attempt", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-feasta-csrf": csrf,
    },
    body: JSON.stringify({action, identifier, idToken}),
  });
  if (!response.ok) {
    throw new WebAuthenticationError(
      response.status === 429
        ? "Too many requests. Please wait before trying again."
        : "The authentication request could not be completed.",
      response.status === 429 ? "rate_limited" : "request_denied",
    );
  }
}

async function exchangeCredentialForSession(
  idToken: string,
  returnTo?: string,
  expectedRole?: WebUserRole,
): Promise<WebSessionResult> {
  const csrf = await getCsrfToken();
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-feasta-csrf": csrf,
    },
    body: JSON.stringify({idToken, returnTo, expectedRole}),
  });

  const body = await response.json() as {
    role?: WebUserRole;
    destination?: string;
    error?: string;
    reason?: string;
  };
  if (!response.ok || !body.role || !body.destination) {
    await signOut(auth);
    throw new WebAuthenticationError(
      body.error ?? "Unable to create a secure session.",
      body.reason,
    );
  }
  return {role: body.role, destination: body.destination};
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await response.json() as {token?: string};
  if (!response.ok || !body.token) throw new Error("Unable to initialize request security.");
  return body.token;
}

async function ensureCustomerProfile(input: Record<string, unknown>) {
  const callable = httpsCallable(functions, "ensureUserProfile");
  await callable(input);
}

function requireCurrentUser(): User {
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Please sign in again to continue.",
      "session_expired",
    );
  }
  return auth.currentUser;
}
