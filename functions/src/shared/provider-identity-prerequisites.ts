import type {UserRecord} from "firebase-admin/auth";
import {HttpsError} from "firebase-functions/v2/https";

import {normalizePhilippineMobile} from "./validation.js";

interface ProviderIdentityUserData {
  phoneNumber?: unknown;
  isPhoneVerified?: unknown;
}

export interface TrustedProviderIdentityEvidence {
  emailCredentialLinked: boolean;
  emailVerified: boolean;
  phoneAuthenticated: boolean;
  phoneNumber: string | null;
  phoneVerified: boolean;
}

/**
 * Derives provider identity evidence from Firebase Auth and trusted profile
 * state. Client-supplied verification booleans are never accepted.
 */
export function deriveTrustedProviderIdentityEvidence(
  authUser: UserRecord,
  userData: ProviderIdentityUserData | null | undefined,
): TrustedProviderIdentityEvidence {
  const authPhone = normalizePhilippineMobile(authUser.phoneNumber);
  const profilePhone = normalizePhilippineMobile(userData?.phoneNumber);
  const phoneAuthenticated = authPhone !== null && authUser.providerData.some(
    (provider) => provider.providerId === "phone",
  );

  return {
    emailCredentialLinked: authUser.providerData.some(
      (provider) => provider.providerId === "password",
    ),
    emailVerified: authUser.emailVerified,
    phoneAuthenticated,
    phoneNumber: authPhone,
    phoneVerified: phoneAuthenticated &&
      userData?.isPhoneVerified === true &&
      profilePhone === authPhone,
  };
}

export function requireTrustedProviderIdentity(
  authUser: UserRecord,
  userData: ProviderIdentityUserData | null | undefined,
): TrustedProviderIdentityEvidence & {phoneNumber: string} {
  const evidence = deriveTrustedProviderIdentityEvidence(authUser, userData);

  if (authUser.disabled) {
    throw new HttpsError(
      "failed-precondition",
      "The provider owner authentication account is disabled.",
    );
  }
  if (!evidence.emailVerified) {
    throw new HttpsError(
      "failed-precondition",
      "Verify your email address before continuing provider setup.",
    );
  }
  if (!evidence.phoneVerified || !evidence.phoneNumber) {
    throw new HttpsError(
      "failed-precondition",
      "Verify your mobile number before continuing provider setup.",
    );
  }

  return {...evidence, phoneNumber: evidence.phoneNumber};
}

/** Auth-owned proof used while the FEASTA provider identity is first created. */
export function isAuthoritativeAuthPhone(
  authUser: UserRecord,
  phoneNumber: string,
): boolean {
  const authPhone = normalizePhilippineMobile(authUser.phoneNumber);
  return authPhone === phoneNumber && authUser.providerData.some(
    (provider) => provider.providerId === "phone",
  );
}
