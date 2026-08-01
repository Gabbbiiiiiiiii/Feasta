"use client";

import {
  createUserWithEmailAndPassword,
  deleteUser,
  browserSessionPersistence,
  reload,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {httpsCallable} from "firebase/functions";
import {ref, uploadBytesResumable} from "firebase/storage";
import {
  UNVERSIONED_POLICY_VERSION,
  type ProviderOnboardingInput,
  type ProviderOwnerIdentityInput,
  type VerificationDocumentType,
} from "@feasta/shared-types";

import {
  authorizeWebAuthenticationAttempt,
  exchangeCurrentUserForSession,
  type WebSessionResult,
  WebAuthenticationError,
} from "@/lib/auth/client-session";
import {auth, functions, storage} from "@/lib/firebase/client";

export type ProviderIdentityInput = Omit<
  ProviderOwnerIdentityInput,
  "phone"
> & {
  phoneNumber: ProviderOwnerIdentityInput["phone"];
  password: string;
};

export type ProviderBusinessInput = ProviderOnboardingInput;

export {UNVERSIONED_POLICY_VERSION};
export type {VerificationDocumentType};

export async function registerProviderIdentity(
  input: ProviderIdentityInput,
): Promise<{verificationEmailSent: boolean}> {
  await authorizeWebAuthenticationAttempt(
    "provider_registration",
    input.email,
  );
  await setPersistence(auth, browserSessionPersistence);
  const credential = await createUserWithEmailAndPassword(
    auth,
    input.email.trim().toLowerCase(),
    input.password,
  );
  try {
    await call("ensureProviderIdentity", {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phoneNumber: input.phoneNumber.trim(),
      acceptedTerms: input.acceptedTerms,
      acceptedPrivacy: input.acceptedPrivacy,
      termsPolicyVersion: input.termsPolicyVersion,
      privacyPolicyVersion: input.privacyPolicyVersion,
    });
  } catch (error) {
    await deleteUser(credential.user).catch(() => undefined);
    throw error;
  }
  try {
    await sendEmailVerification(credential.user);
    return {verificationEmailSent: true};
  } catch {
    return {verificationEmailSent: false};
  }
}

export async function signInProvider(
  email: string,
  password: string,
  returnTo?: string,
): Promise<WebSessionResult> {
  await setPersistence(auth, browserSessionPersistence);
  await signInWithEmailAndPassword(
    auth,
    email.trim().toLowerCase(),
    password,
  );
  try {
    return await exchangeCurrentUserForSession("provider", returnTo);
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

export async function refreshProviderVerification(): Promise<{
  verified: boolean;
  destination?: string;
}> {
  const user = requireProviderAuthUser();
  await reload(user);
  if (!user.emailVerified) return {verified: false};
  const session = await exchangeCurrentUserForSession("provider", "/provider");
  return {verified: true, destination: session.destination};
}

export async function resendProviderVerification(): Promise<void> {
  await authorizeWebAuthenticationAttempt("email_verification_resend");
  await sendEmailVerification(requireProviderAuthUser());
}

export async function registerProviderBusiness(
  input: ProviderBusinessInput,
  idempotencyKey: string,
): Promise<{
  providerId: string;
  verificationId: string;
  created: boolean;
}> {
  return call("registerProvider", {
    ownerFirstName: input.ownerFirstName,
    ownerLastName: input.ownerLastName,
    businessName: input.businessName,
    businessEmail: input.businessEmail.trim().toLowerCase(),
    businessPhone: input.businessPhone,
    description: input.description,
    providerServiceType: input.providerServiceType,
    providerCategory: input.providerCategory,
    serviceCategories: input.serviceCategories,
    address: input.address,
    city: input.city,
    province: input.province,
    locationCoordinates: input.locationCoordinates,
    serviceAreas: input.serviceAreas,
    maxServiceDistanceKm: input.maxServiceDistanceKm,
    eventTypesSupported: input.eventTypesSupported,
    minGuestsPerEvent: input.minGuestsPerEvent,
    maxGuestsPerEvent: input.maxGuestsPerEvent,
    acceptsMultipleEventsPerDay: input.acceptsMultipleEventsPerDay,
    maxEventsPerDay: input.maxEventsPerDay,
    availableStaffCount: input.availableStaffCount,
    availableEquipmentCount: input.availableEquipmentCount,
    operatingDays: input.operatingDays,
    bookingLeadTimeDays: input.bookingLeadTimeDays,
    unavailableDates: input.unavailableDates,
    logoUrl: input.logoUrl,
    logoPublicId: input.logoPublicId,
    coverImageUrl: input.coverImageUrl,
    coverPublicId: input.coverPublicId,
    idempotencyKey,
  });
}

export async function saveProviderOnboardingDraft(
  step: number,
  data: Record<string, unknown>,
): Promise<{completedSteps: number[]; nextStep: number}> {
  return call("saveProviderOnboardingDraft", {step, data});
}

export async function uploadVerificationDocument(input: {
  providerId: string;
  verificationId: string;
  documentType: VerificationDocumentType;
  file: File;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const allowed = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  if (!allowed.has(input.file.type)) {
    throw new WebAuthenticationError(
      "Choose a PDF, JPEG, PNG, or WebP file.",
      "validation",
    );
  }
  if (input.file.size <= 0 || input.file.size > 10 * 1024 * 1024) {
    throw new WebAuthenticationError(
      "The file must be no larger than 10 MB.",
      "validation",
    );
  }

  await auth.authStateReady();

  const user = requireProviderAuthUser();
  await user.getIdToken(true);
  const extension = safeExtension(input.file.name, input.file.type);
  const uniqueName = `${globalThis.crypto.randomUUID()}${extension}`;
  const storagePath =
    `providers/${input.providerId}/verification/${input.documentType}/${uniqueName}`;
  await new Promise<void>((resolve, reject) => {
    const task = uploadBytesResumable(
      ref(storage, storagePath),
      input.file,
      {
        contentType: input.file.type,
        customMetadata: {
          feastaScope: "provider_verification",
        },
      },
    );
    task.on(
      "state_changed",
      (snapshot) => {
        const percent = snapshot.totalBytes > 0
          ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
          : 0;
        input.onProgress?.(percent);
      },
      reject,
      resolve,
    );
  });
  await call("registerVerificationDocument", {
    verificationId: input.verificationId,
    documentType: input.documentType,
    displayName: documentLabel(input.documentType),
    storagePath,
    originalFileName: input.file.name.slice(0, 255),
  });
}

export async function removeVerificationDocument(input: {
  verificationId: string;
  documentType: VerificationDocumentType;
}): Promise<{removed: boolean}> {
  return call("removeVerificationDocument", input);
}

export async function submitProviderVerification(
  providerId: string,
  idempotencyKey: string,
): Promise<{
  status: "submitted";
  idempotentReplay: boolean;
  alreadySubmitted: boolean;
}> {
  return call("submitProviderVerification", {providerId, idempotencyKey});
}

function requireProviderAuthUser() {
  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Please sign in again to continue.",
      "session_expired",
    );
  }
  return auth.currentUser;
}

async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  const response = await httpsCallable<Record<string, unknown>, T>(
    functions,
    name,
  )(data);
  return response.data;
}

function safeExtension(name: string, contentType: string): string {
  const expected: Record<string, string> = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  const extension = name.toLowerCase().match(/\.(pdf|jpe?g|png|webp)$/u)?.[0];
  return extension ?? expected[contentType];
}

function documentLabel(type: VerificationDocumentType): string {
  return type.split("_").map(
    (part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`,
  ).join(" ");
}
