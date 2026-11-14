"use client";

import {
  PhoneAuthProvider,
  RecaptchaVerifier,
  linkWithCredential,
  reload,
  updatePhoneNumber,
  type ApplicationVerifier,
} from "firebase/auth";

import {
  auth,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

import {
  exchangeCurrentUserForSession,
  WebAuthenticationError,
  type WebSessionResult,
} from "@/lib/auth/client-session";

/* ============================================================
   TYPES
   ============================================================ */

export type CustomerPhoneVerificationSession = {
  verificationId: string;
  phoneNumber: string;
  uid: string;
};

/* ============================================================
   FIREBASE CALLABLE HELPER
   ============================================================ */

async function call<T>(
  name: string,
  data: Record<string, unknown>,
): Promise<T> {
  initializeBrowserAppCheck();

  const {httpsCallable} = await import("firebase/functions");
  const {functions} = await import("@/lib/firebase/client");

  const callable = httpsCallable<
    Record<string, unknown>,
    T
  >(functions, name);

  const response = await callable(data);

  return response.data;
}

/* ============================================================
   CURRENT CUSTOMER
   ============================================================ */

function requireCustomerAuthUser() {
  const user = auth.currentUser;

  if (!user) {
    throw new WebAuthenticationError(
      "Sign in to continue.",
      "session_expired",
    );
  }

  return user;
}

/* ============================================================
   PHILIPPINE MOBILE NORMALIZATION
   ============================================================ */

function normalizePhilippineMobile(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value
    .trim()
    .replace(/[\s()-]/g, "");

  if (/^\+639\d{9}$/.test(cleaned)) {
    return cleaned;
  }

  if (/^09\d{9}$/.test(cleaned)) {
    return `+63${cleaned.slice(1)}`;
  }

  if (/^639\d{9}$/.test(cleaned)) {
    return `+${cleaned}`;
  }

  return null;
}

/* ============================================================
   RECAPTCHA
   ============================================================ */

export function createCustomerPhoneRecaptcha(
  container: string | HTMLElement,
): RecaptchaVerifier {
  return new RecaptchaVerifier(
    auth,
    container,
    {
      size: "invisible",
    },
  );
}

/* ============================================================
   REQUEST SMS VERIFICATION
   ============================================================ */

export async function requestCustomerPhoneVerification(
  verifier: ApplicationVerifier,
  replacementPhoneNumber?: string,
): Promise<CustomerPhoneVerificationSession> {
  await auth.authStateReady();

  const user = requireCustomerAuthUser();

  if (!user.emailVerified) {
    throw new WebAuthenticationError(
      "Verify your email before verifying your mobile number.",
      "validation",
    );
  }

  const replacement =
    replacementPhoneNumber === undefined
      ? undefined
      : normalizePhilippineMobile(
          replacementPhoneNumber,
        );

  if (
    replacementPhoneNumber !== undefined &&
    !replacement
  ) {
    throw new WebAuthenticationError(
      "Enter a valid Philippine mobile number.",
      "validation",
    );
  }

  const prepared = await call<{
    phoneNumber: string;
  }>(
    "prepareCustomerPhoneVerification",
    replacement
      ? {
          phoneNumber: replacement,
        }
      : {},
  );

  const phoneNumber =
    normalizePhilippineMobile(
      prepared.phoneNumber,
    );

  if (!phoneNumber) {
    throw new WebAuthenticationError(
      "Your registered mobile number is unavailable. Use another number.",
      "validation",
    );
  }

  const verificationId =
    await new PhoneAuthProvider(
      auth,
    ).verifyPhoneNumber(
      phoneNumber,
      verifier,
    );

  return {
    verificationId,
    phoneNumber,
    uid: user.uid,
  };
}

/* ============================================================
   CONFIRM OTP
   ============================================================ */

export async function confirmCustomerPhoneVerification(
  session: CustomerPhoneVerificationSession,
  code: string,
  returnTo = "/customer",
): Promise<WebSessionResult> {
  await auth.authStateReady();

  const user = requireCustomerAuthUser();

  if (user.uid !== session.uid) {
    throw new WebAuthenticationError(
      "Your session changed. Please sign in again.",
      "session_expired",
    );
  }

  const normalizedCode = code.trim();

  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new WebAuthenticationError(
      "Enter the 6-digit verification code.",
      "validation",
    );
  }

  const credential =
    PhoneAuthProvider.credential(
      session.verificationId,
      normalizedCode,
    );

  const alreadyLinked =
    user.providerData.some(
      (provider) =>
        provider.providerId ===
        PhoneAuthProvider.PROVIDER_ID,
    );

  if (alreadyLinked) {
    await updatePhoneNumber(
      user,
      credential,
    );
  } else {
    const result =
      await linkWithCredential(
        user,
        credential,
      );

    if (result.user.uid !== session.uid) {
      throw new WebAuthenticationError(
        "Phone verification could not be linked to this account.",
        "session_expired",
      );
    }
  }

  if (
    auth.currentUser?.uid !==
    session.uid
  ) {
    throw new WebAuthenticationError(
      "Your session changed. Please sign in again.",
      "session_expired",
    );
  }

  await reload(user);

  if (
    user.phoneNumber !==
    session.phoneNumber
  ) {
    throw new WebAuthenticationError(
      "The verified number did not match your registered number.",
      "validation",
    );
  }

  /*
   * Force Firebase to issue an updated ID token containing
   * the newly linked phone authentication state.
   */
  await user.getIdToken(true);

  /*
   * Synchronize Firebase Auth phone verification with the
   * FEASTA user/customer records.
   *
   * This callable already exists for the provider workflow,
   * so we reuse the trusted synchronization boundary.
   */
  await call(
    "syncPhoneVerification",
    {},
  );

  /*
   * Recreate the secure web session after Firebase Auth and
   * Firestore verification state have been synchronized.
   *
   * The server-side session exchange will sanitize returnTo
   * for the customer role.
   */
  return exchangeCurrentUserForSession(
    "customer",
    returnTo,
  );
}