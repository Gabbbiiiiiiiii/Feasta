"use client";

import {
  browserSessionPersistence,
  EmailAuthProvider,
  linkWithCredential,
  PhoneAuthProvider,
  RecaptchaVerifier,
  reload,
  sendEmailVerification,
  setPersistence,
  signInWithPhoneNumber,
  signInWithEmailAndPassword,
  signOut,
  updatePhoneNumber,
  type ApplicationVerifier,
  type ConfirmationResult,
} from "firebase/auth";
import {httpsCallable} from "firebase/functions";
import {ref, uploadBytesResumable} from "firebase/storage";
import {
  UNVERSIONED_POLICY_VERSION,
  normalizePhilippineMobile,
  validateProviderOwnerIdentityInput,
  type ProviderOnboardingInput,
  type ProviderOwnerIdentityInput,
  type ProviderAccountClassification,
  type ProviderRegistrationResolution,
  type VerificationDocumentType,
} from "@feasta/shared-types";

import {
  authorizeWebAuthenticationAttempt,
  exchangeCurrentUserForSession,
  getCsrfToken,
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

export interface ProviderPhoneVerificationSession {
  verificationId: string;
  phoneNumber: string;
  uid: string;
}

export interface ProviderPhoneRegistrationResult {
  classification: ProviderAccountClassification;
  resolution: ProviderRegistrationResolution;
  phoneNumber: string;
}

export {UNVERSIONED_POLICY_VERSION};
export type {VerificationDocumentType};

export async function requestProviderRegistrationPhoneCode(
  phoneNumber: string,
  createVerifier: () => ApplicationVerifier,
): Promise<{confirmation: ConfirmationResult; phoneNumber: string}> {
  const normalizedPhone = normalizePhilippineMobile(phoneNumber);
  if (!normalizedPhone) {
    throw new WebAuthenticationError(
      "Enter a valid Philippine mobile number.",
      "validation",
    );
  }
  await authorizeWebAuthenticationAttempt(
    "provider_phone_registration",
    normalizedPhone,
  );
  await setPersistence(auth, browserSessionPersistence);
  const verifier = createVerifier();
  const confirmation = await signInWithPhoneNumber(
    auth,
    normalizedPhone,
    verifier,
  );
  return {confirmation, phoneNumber: normalizedPhone};
}

export async function confirmProviderRegistrationPhoneCode(
  confirmation: ConfirmationResult,
  code: string,
  expectedPhoneNumber: string,
): Promise<ProviderPhoneRegistrationResult> {
  if (!/^\d{6}$/u.test(code)) {
    throw new WebAuthenticationError(
      "Enter the 6-digit verification code.",
      "validation",
    );
  }
  const credential = await confirmation.confirm(code);
  const authenticatedUid = credential.user.uid;
  if (auth.currentUser?.uid !== authenticatedUid) {
    throw new WebAuthenticationError(
      "Your authentication session changed. Start again.",
      "session_expired",
    );
  }
  return classifyCurrentProviderPhoneUser(
    expectedPhoneNumber,
    authenticatedUid,
  );
}

export async function resumeProviderPhoneRegistration(): Promise<
  ProviderPhoneRegistrationResult | null
> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) return null;
  const token = await user.getIdTokenResult();
  if (
    token.signInProvider !== PhoneAuthProvider.PROVIDER_ID ||
    !user.providerData.some(
      (provider) => provider.providerId === PhoneAuthProvider.PROVIDER_ID,
    )
  ) {
    return null;
  }
  const phoneNumber = normalizePhilippineMobile(user.phoneNumber);
  if (!phoneNumber) {
    throw new WebAuthenticationError(
      "The authenticated mobile number is unavailable.",
      "session_expired",
    );
  }
  return classifyCurrentProviderPhoneUser(phoneNumber, user.uid);
}

export async function resumeExistingProviderAfterPhoneAuth(): Promise<
  WebSessionResult
> {
  await call("syncPhoneVerification", {});
  return exchangeCurrentUserForSession("provider", "/provider");
}

export async function abandonProviderPhoneRegistration(): Promise<void> {
  await signOut(auth);
}

async function classifyCurrentProviderPhoneUser(
  expectedPhoneNumber: string,
  authenticatedUid: string,
): Promise<ProviderPhoneRegistrationResult> {
  const user = requireProviderAuthUser();
  const normalizedExpected = normalizePhilippineMobile(expectedPhoneNumber);
  const normalizedAuthPhone = normalizePhilippineMobile(user.phoneNumber);
  if (
    user.uid !== authenticatedUid ||
    !normalizedExpected ||
    normalizedAuthPhone !== normalizedExpected ||
    !user.providerData.some(
      (provider) => provider.providerId === PhoneAuthProvider.PROVIDER_ID,
    )
  ) {
    throw new WebAuthenticationError(
      "The authenticated mobile number could not be confirmed.",
      "session_expired",
    );
  }
  const idToken = await user.getIdToken(true);
  const csrf = await getCsrfToken();
  const response = await fetch("/api/auth/provider-registration/classify", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-feasta-csrf": csrf,
    },
    body: JSON.stringify({
      idToken,
      phoneNumber: normalizedExpected,
    }),
  });
  const body = await response.json() as Partial<ProviderPhoneRegistrationResult> & {
    error?: string;
  };
  if (!response.ok || !body.classification || !body.resolution) {
    throw new WebAuthenticationError(
      response.status === 429
        ? "Too many requests. Please wait before trying again."
        : "The provider registration request could not be completed.",
      response.status === 429 ? "rate_limited" : "request_denied",
    );
  }
  return {
    classification: body.classification,
    resolution: body.resolution,
    phoneNumber: normalizedExpected,
  };
}

export async function registerProviderIdentity(
  input: ProviderIdentityInput,
): Promise<{
  verificationEmailSent: boolean;
  emailVerified: boolean;
  credentialLinked: boolean;
}> {
  const validation = validateProviderOwnerIdentityInput({
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phoneNumber,
    acceptedTerms: input.acceptedTerms,
    acceptedPrivacy: input.acceptedPrivacy,
    termsPolicyVersion: input.termsPolicyVersion,
    privacyPolicyVersion: input.privacyPolicyVersion,
  });
  if (!validation.success) {
    const invalidPhone = validation.issues.some(
      (issue) => issue.field === "phone",
    );
    throw new WebAuthenticationError(
      invalidPhone
        ? "Enter a valid Philippine mobile number."
        : "Review the provider account details and try again.",
      "validation",
    );
  }
  const identity = validation.value;
  await authorizeWebAuthenticationAttempt(
    "provider_registration",
    identity.email,
  );
  await setPersistence(auth, browserSessionPersistence);
  await auth.authStateReady();
  const user = requireProviderAuthUser();
  const originalUid = user.uid;
  const authPhone = normalizePhilippineMobile(user.phoneNumber);
  const hasPhoneProvider = user.providerData.some(
    (provider) => provider.providerId === PhoneAuthProvider.PROVIDER_ID,
  );
  if (!hasPhoneProvider || authPhone !== identity.phone) {
    throw new WebAuthenticationError(
      "Your verified mobile session changed. Verify your number again.",
      "session_expired",
    );
  }

  const unsupportedProvider = user.providerData.some(
    (provider) =>
      provider.providerId !== PhoneAuthProvider.PROVIDER_ID &&
      provider.providerId !== EmailAuthProvider.PROVIDER_ID,
  );
  if (unsupportedProvider) {
    throw new WebAuthenticationError(
      "This authentication relationship cannot continue provider registration.",
      "account_inconsistent",
    );
  }

  let credentialLinked = false;
  if (hasPasswordProvider(user)) {
    assertLinkedProviderAccount(user, originalUid, identity.email);
  } else {
    const emailCredential = EmailAuthProvider.credential(
      identity.email,
      input.password,
    );
    try {
      const linkResult = await linkWithCredential(user, emailCredential);
      if (
        linkResult.user.uid !== originalUid ||
        auth.currentUser?.uid !== originalUid
      ) {
        throw new WebAuthenticationError(
          "Your authentication session changed. Start again safely.",
          "uid_mismatch",
        );
      }
      credentialLinked = true;
    } catch (error) {
      if (!firebaseCode(error).includes("provider-already-linked")) {
        throw error;
      }
      await reload(user);
    }
    assertLinkedProviderAccount(requireProviderAuthUser(), originalUid, identity.email);
  }

  await reload(user);
  assertLinkedProviderAccount(requireProviderAuthUser(), originalUid, identity.email);
  if (normalizePhilippineMobile(user.phoneNumber) !== identity.phone) {
    throw new WebAuthenticationError(
      "Your verified mobile session changed. Verify your number again.",
      "session_expired",
    );
  }
  await user.getIdToken(true);
  await call("ensureProviderIdentity", {
    firstName: identity.firstName,
    lastName: identity.lastName,
    email: identity.email,
    phoneNumber: identity.phone,
    acceptedTerms: identity.acceptedTerms,
    acceptedPrivacy: identity.acceptedPrivacy,
    termsPolicyVersion: identity.termsPolicyVersion,
    privacyPolicyVersion: identity.privacyPolicyVersion,
  });
  assertLinkedProviderAccount(requireProviderAuthUser(), originalUid, identity.email);

  if (user.emailVerified) {
    return {
      verificationEmailSent: false,
      emailVerified: true,
      credentialLinked,
    };
  }
  try {
    await sendEmailVerification(user);
    return {
      verificationEmailSent: true,
      emailVerified: false,
      credentialLinked,
    };
  } catch {
    return {
      verificationEmailSent: false,
      emailVerified: false,
      credentialLinked,
    };
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

export function createProviderPhoneRecaptcha(
  container: string | HTMLElement,
): RecaptchaVerifier {
  return new RecaptchaVerifier(auth, container, {
    size: "invisible",
  });
}

export async function requestProviderPhoneVerification(
  verifier: ApplicationVerifier,
  replacementPhoneNumber?: string,
): Promise<ProviderPhoneVerificationSession> {
  await auth.authStateReady();
  const user = requireProviderAuthUser();
  if (!user.emailVerified) {
    throw new WebAuthenticationError(
      "Verify your email before verifying your mobile number.",
      "validation",
    );
  }
  const replacement = replacementPhoneNumber === undefined
    ? undefined
    : normalizePhilippineMobile(replacementPhoneNumber);
  if (replacementPhoneNumber !== undefined && !replacement) {
    throw new WebAuthenticationError(
      "Enter a valid Philippine mobile number.",
      "validation",
    );
  }
  const prepared = await call<{phoneNumber: string}>(
    "prepareProviderPhoneVerification",
    replacement ? {phoneNumber: replacement} : {},
  );
  const phoneNumber = normalizePhilippineMobile(prepared.phoneNumber);
  if (!phoneNumber) {
    throw new WebAuthenticationError(
      "Your registered mobile number is unavailable. Use another number.",
      "validation",
    );
  }
  const verificationId = await new PhoneAuthProvider(auth).verifyPhoneNumber(
    phoneNumber,
    verifier,
  );
  return {verificationId, phoneNumber, uid: user.uid};
}

export async function confirmProviderPhoneVerification(
  session: ProviderPhoneVerificationSession,
  code: string,
): Promise<WebSessionResult> {
  await auth.authStateReady();
  const user = requireProviderAuthUser();
  if (user.uid !== session.uid) {
    throw new WebAuthenticationError(
      "Your session changed. Please sign in again.",
      "session_expired",
    );
  }
  const credential = PhoneAuthProvider.credential(
    session.verificationId,
    code,
  );
  const alreadyLinked = user.providerData.some(
    (provider) => provider.providerId === PhoneAuthProvider.PROVIDER_ID,
  );
  if (alreadyLinked) {
    await updatePhoneNumber(user, credential);
  } else {
    const result = await linkWithCredential(user, credential);
    if (result.user.uid !== session.uid) {
      throw new WebAuthenticationError(
        "Phone verification could not be linked to this account.",
        "session_expired",
      );
    }
  }
  if (auth.currentUser?.uid !== session.uid) {
    throw new WebAuthenticationError(
      "Your session changed. Please sign in again.",
      "session_expired",
    );
  }
  await reload(user);
  if (user.phoneNumber !== session.phoneNumber) {
    throw new WebAuthenticationError(
      "The verified number did not match your registered number.",
      "validation",
    );
  }
  await user.getIdToken(true);
  await call("syncPhoneVerification", {});
  return exchangeCurrentUserForSession("provider", "/provider");
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

function hasPasswordProvider(user: {providerData: readonly {providerId: string}[]}): boolean {
  return user.providerData.some(
    (provider) => provider.providerId === EmailAuthProvider.PROVIDER_ID,
  );
}

function assertLinkedProviderAccount(
  user: ReturnType<typeof requireProviderAuthUser>,
  originalUid: string,
  normalizedEmail: string,
): void {
  if (user.uid !== originalUid || auth.currentUser?.uid !== originalUid) {
    throw new WebAuthenticationError(
      "Your authentication session changed. Start again safely.",
      "uid_mismatch",
    );
  }
  if (!hasPasswordProvider(user)) {
    throw new WebAuthenticationError(
      "The email sign-in method was not linked. Try again.",
      "credential_not_linked",
    );
  }
  if (!user.providerData.some(
    (provider) => provider.providerId === PhoneAuthProvider.PROVIDER_ID,
  )) {
    throw new WebAuthenticationError(
      "The verified mobile sign-in method is unavailable. Start again safely.",
      "account_inconsistent",
    );
  }
  if (user.email?.trim().toLowerCase() !== normalizedEmail) {
    throw new WebAuthenticationError(
      "This phone account already has a different email. Sign in to the correct account or contact support.",
      "account_inconsistent",
    );
  }
}

function firebaseCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
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
