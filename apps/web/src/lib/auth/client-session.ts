"use client";

import {
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  deleteUser,
  GoogleAuthProvider,
  browserLocalPersistence,
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
import {authDiagnostic} from "./auth-diagnostics";

export type WebUserRole = UserRole;
export type WebAuthenticationAttemptAction =
  | "customer_registration"
  | "provider_registration"
  | "provider_phone_registration"
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

export type CustomerConsentInput = {
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
  let credentialObtained = false;
  let stage: Parameters<typeof authDiagnostic>[1] = "persistence";
  try {
    await setPersistence(auth, browserLocalPersistence);
    stage = "credential";
    authDiagnostic("email", stage, "started");
    const credential = await signInWithEmailAndPassword(
      auth, email.trim().toLowerCase(), password,
    );
    credentialObtained = true;
    authDiagnostic("email", stage, "succeeded", undefined, true, !!auth.currentUser);
    // Repair customer records without manufacturing consent during sign-in.
    // New profiles still require explicit terms and privacy acceptance.
    stage = "profile";
    await ensureCustomerProfile({});
    stage = "session_exchange";
    const result = await exchangeCredentialForSession(
      await credential.user.getIdToken(true),
      returnTo,
      "customer",
    );
    authDiagnostic("email", stage, "succeeded", undefined, true, !!auth.currentUser);
    return result;
  } catch (error) {
    authDiagnostic("email", stage, "failed", error, credentialObtained, !!auth.currentUser);
    if (credentialObtained) await signOut(auth);
    throw error;
  }
}

export async function signInWithGoogle(
  returnTo?: string,
  signal?: AbortSignal,
  consent?: CustomerConsentInput,
): Promise<WebSessionResult> {
  const previousUser = auth.currentUser;
  let user: User | undefined;
  let stage: Parameters<typeof authDiagnostic>[1] = "persistence";
  try {
    signal?.throwIfAborted();
    authDiagnostic("google", stage, "started");
    await googleStep(setPersistence(auth, browserLocalPersistence), signal);
    signal?.throwIfAborted();
    stage = "popup";
    authDiagnostic("google", stage, "started");
    // Only this popup's credential may establish the FEASTA session.
    user = (await googleStep(signInWithPopup(auth, new GoogleAuthProvider()), signal, 90_000)).user;
    authDiagnostic("google", "credential", "succeeded", undefined, true, !!auth.currentUser);
    signal?.throwIfAborted();
    stage = "profile";
    await googleStep(
      ensureCustomerProfile(
        consent
          ? {
              acceptedTerms: consent.acceptedTerms,
              acceptedPrivacy: consent.acceptedPrivacy,
            }
          : {},
      ),
      signal,
    );
    stage = "credential";
    const token = await googleStep(user.getIdToken(true), signal);
    signal?.throwIfAborted();
    stage = "session_exchange";
    authDiagnostic("google", stage, "started", undefined, true, !!auth.currentUser);
    const session = new AbortController();
    const abort = () => session.abort(signal?.reason);
    signal?.addEventListener("abort", abort, {once: true});
    const timeout = setTimeout(() => session.abort(new DOMException("Session timed out", "TimeoutError")), 30_000);
    try {
      const result = await exchangeCredentialForSession(token, returnTo, "customer", session.signal);
      authDiagnostic("google", stage, "succeeded", undefined, true, !!auth.currentUser);
      return result;
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  } catch (error) {
    authDiagnostic("google", stage, "failed", error, !!user, !!auth.currentUser);
    // Roll back only a newly established user still owned by this attempt.
    // Never sign out a pre-existing account or a replacement from another flow.
    if (user && auth.currentUser === user && previousUser?.uid !== user.uid) {
      await googleStep(signOut(auth)).catch((rollbackError) => {
        authDiagnostic("google", "rollback", "failed", rollbackError, true, !!auth.currentUser);
      });
    }
    if (signal?.aborted) throw error;
    if (error instanceof TypeError && stage === "session_exchange") {
      throw new WebAuthenticationError("Session connection failed.", "google_unavailable");
    }
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new WebAuthenticationError("Google sign-in could not establish a session. Try again or use email sign-in.", "google_timeout");
    }
    throw error;
  }
}

async function googleStep<T>(operation: Promise<T>, signal?: AbortSignal, milliseconds = 30_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort = () => {};
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      abort = () => reject(signal?.reason ?? new DOMException("Sign-in cancelled", "AbortError"));
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, {once: true});
      timer = setTimeout(() => reject(new WebAuthenticationError(
        "Google sign-in could not complete. Check your connection and try again, or use email sign-in.", "google_timeout",
      )), milliseconds);
    })]);
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}

export async function registerCustomer(
  input: CustomerRegistrationInput,
): Promise<{verificationEmailSent: boolean}> {
  await authorizeWebAuthenticationAttempt(
    "customer_registration",
    input.email,
  );
  await setPersistence(auth, browserLocalPersistence);
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
    "provider_phone_registration",
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
  signal?: AbortSignal,
): Promise<WebSessionResult> {
  const csrf = await getCsrfToken(signal);
  const response = await fetch("/api/auth/session", {
    signal,
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
    // Google owns its conditional rollback; other callers retain their behavior.
    if (!signal) await signOut(auth);
    throw new WebAuthenticationError(
      body.error ?? "Unable to create a secure session.",
      signal && response.status >= 500 ? "google_unavailable" : body.reason,
    );
  }
  return {role: body.role, destination: body.destination};
}

export async function getCsrfToken(signal?: AbortSignal): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    signal,
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
