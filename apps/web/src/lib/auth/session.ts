import "server-only";

import {
  PROVIDER_EVENT_TYPES,
  PROVIDER_OPERATING_DAYS,
  PROVIDER_SERVICE_CATEGORIES,
  type ProviderEventType,
  type ProviderOperatingDay,
  type ProviderServiceCategory,
  type UserRole,
} from "@feasta/shared-types";
import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import type {NextResponse} from "next/server";
import {FieldValue} from "firebase-admin/firestore";

import {
  accountHomePath,
  providerAccessDestination,
  resolveTrustedAccountContext,
  safeReturnPathForAccount,
  type AccountContextFailureReason,
  type ServerAccountContext,
} from "@/lib/auth/account-policy";
import {adminAuth, adminDb} from "@/lib/firebase/admin";
import {logWebSecurityEvent} from "@/lib/security/logging";
import {
  isRoleAllowed,
  sessionCookiePolicy,
  verifyRevocationAwareSession,
} from "@/lib/security/policy";
import {CSRF_COOKIE_NAME} from "@/lib/security/request";
import type {ProviderOnboardingDraft} from "@/lib/provider/onboarding";

export const SESSION_COOKIE_NAME = "feasta_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 5;

export type {UserRole} from "@feasta/shared-types";
export type SessionUser = ServerAccountContext;

export const sessionCookieOptions = sessionCookiePolicy(
  process.env.NODE_ENV === "production",
  SESSION_MAX_AGE_SECONDS,
);

export class AccountAccessError extends Error {
  constructor(public readonly reason: AccountContextFailureReason) {
    super("The account cannot access this resource.");
    this.name = "AccountAccessError";
  }
}

export async function createSession(idToken: string): Promise<{
  cookie: string;
  account: SessionUser;
}> {
  const decoded = await adminAuth.verifyIdToken(idToken, true);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - decoded.auth_time > 5 * 60 || decoded.auth_time > nowSeconds) {
    throw new Error("Recent sign-in is required.");
  }

  const account = await loadTrustedAccountContext(decoded.uid);
  const cookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_SECONDS * 1000,
  });
  return {cookie, account};
}

/** Compatibility alias retained for existing Phase 3/4 consumers. */
export async function createVerifiedSession(idToken: string): Promise<{
  cookie: string;
  user: SessionUser;
}> {
  const {cookie, account} = await createSession(idToken);
  return {cookie, user: account};
}

export async function verifySessionCookie(
  sessionCookie: string,
  options: {checkRevoked?: boolean} = {},
): Promise<SessionUser> {
  const decoded = await verifyRevocationAwareSession(
    sessionCookie,
    (value, checkRevoked) => adminAuth.verifySessionCookie(value, checkRevoked),
    options.checkRevoked ?? true,
  );
  return loadTrustedAccountContext(decoded.uid);
}

export async function getOptionalAccountContext(
  options: {checkRevoked?: boolean} = {},
): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!value) return null;

  try {
    return await verifySessionCookie(value, options);
  } catch {
    logWebSecurityEvent({
      action: "session_access_denied",
      outcome: "denied",
      reasonCode: "invalid_expired_or_revoked_session",
    });
    return null;
  }
}

export const getSessionUser = getOptionalAccountContext;

export async function requireAuthenticatedAccount(options: {
  checkRevoked?: boolean;
  returnTo?: string;
  loginPath?: "/login" | "/provider-login" | "/admin-login";
} = {}): Promise<SessionUser> {
  const cookieStore = await cookies();
  const hadCookie = cookieStore.has(SESSION_COOKIE_NAME);
  const account = await getOptionalAccountContext(options);
  if (account) return account;

  const requested = typeof options.returnTo === "string" &&
    options.returnTo.startsWith("/") &&
    !options.returnTo.startsWith("//")
    ? options.returnTo
    : "/login";
  if (hadCookie) {
    redirect(`/api/auth/session/invalid?returnTo=${encodeURIComponent(requested)}`);
  }
  const loginPath = options.loginPath ?? "/login";
  redirect(requested === loginPath
    ? loginPath
    : `${loginPath}?next=${encodeURIComponent(requested)}`);
}

export const requireSessionUser = requireAuthenticatedAccount;

export async function requireRole(
  allowedRoles: readonly UserRole[],
  options: {
    returnTo?: string;
    loginPath?: "/login" | "/provider-login" | "/admin-login";
  } = {},
): Promise<SessionUser> {
  const account = await requireAuthenticatedAccount(options);
  if (!isRoleAllowed(account.role, allowedRoles)) {
    logWebSecurityEvent({
      action: "role_access_denied",
      outcome: "denied",
      actorUid: account.uid,
      targetId: allowedRoles.join(","),
      reasonCode: "role_not_allowed",
    });
    redirect("/unauthorized");
  }
  return account;
}

export function requireActiveAccount(account: SessionUser): SessionUser {
  if (
    account.accountStatus !== "active" ||
    account.isActive !== true ||
    account.isBlocked !== false
  ) {
    throw new AccountAccessError("inactive_account");
  }
  return account;
}

export async function requireCustomer(): Promise<SessionUser> {
  return requireRole(["customer"]);
}

export async function requireProvider(): Promise<SessionUser> {
  return requireRole(["provider"], {
    returnTo: "/provider",
    loginPath: "/provider-login",
  });
}

export async function requireApprovedProvider(): Promise<SessionUser> {
  const account = await requireProvider();
  if (
    account.provider?.verificationStatus !== "approved" ||
    account.provider.isActive !== true ||
    account.provider.isSuspended === true
  ) {
    redirect(providerAccessDestination(account));
  }
  return account;
}

export async function requireAdmin(): Promise<SessionUser> {
  return requireRole(["admin"], {
    returnTo: "/admin",
    loginPath: "/admin-login",
  });
}

export function requireVerifiedEmail(
  account: SessionUser,
  verificationPath = "/verify-email",
): SessionUser {
  if (!account.emailVerified) redirect(verificationPath);
  return account;
}

export async function loadOwnedProviderVerification(
  account: SessionUser,
): Promise<{
  id: string;
  status: string;
  remarks: string | null;
  rejectionReason: string | null;
  resubmissionReason: string | null;
  suspensionReason: string | null;
  documents: Array<{id: string; status: string; displayName: string}>;
} | null> {
  if (account.role !== "provider" || !account.providerId) return null;
  const snapshot = await adminDb.collection("providerVerifications")
    .where("providerId", "==", account.providerId)
    .limit(2)
    .get();
  const verification = snapshot.docs.find(
    (document) => document.data().ownerId === account.uid,
  );
  if (!verification) return null;
  const data = verification.data();
  const documents = await verification.ref.collection("documents").get();
  const safeText = (value: unknown) => typeof value === "string"
    ? value.slice(0, 2000)
    : null;
  return {
    id: verification.id,
    status: typeof data.status === "string" ? data.status : "unknown",
    remarks: safeText(data.remarks),
    rejectionReason: safeText(data.rejectionReason),
    resubmissionReason: safeText(data.resubmissionReason),
    suspensionReason: safeText(data.suspensionReason),
    documents: documents.docs.map((document) => ({
      id: document.id,
      status: typeof document.data().status === "string"
        ? document.data().status
        : "unknown",
      displayName: typeof document.data().displayName === "string"
        ? document.data().displayName.slice(0, 120)
        : document.id,
    })),
  };
}

export async function loadProviderOnboardingDraft(
  account: SessionUser,
): Promise<ProviderOnboardingDraft> {
  if (account.role !== "provider" || account.providerId) {
    throw new AccountAccessError("invalid_provider_link");
  }
  const [userSnapshot, draftSnapshot] = await Promise.all([
    adminDb.collection("users").doc(account.uid).get(),
    adminDb.collection("providerOnboardingDrafts").doc(account.uid).get(),
  ]);
  const user = userSnapshot.data() ?? {};
  const draft = draftSnapshot.data() ?? {};
  const text = (value: unknown, fallback = "") =>
    typeof value === "string" ? value.slice(0, 2000) : fallback;
  const stringList = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
        .slice(0, 50)
      : [];
  const enumList = <T extends string>(
    value: unknown,
    allowed: readonly T[],
  ): T[] => stringList(value).filter(
    (item): item is T => allowed.includes(item as T),
  );
  const integer = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isInteger(value)
      ? value
      : fallback;
  const coordinates = draft.locationCoordinates as {
    latitude?: unknown;
    longitude?: unknown;
  } | null | undefined;
  const safeCoordinates = coordinates &&
    typeof coordinates === "object" &&
    typeof coordinates.latitude === "number" &&
    typeof coordinates.longitude === "number"
    ? {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      }
    : null;
  return {
    ownerFirstName: text(draft.ownerFirstName, text(user.firstName)),
    ownerLastName: text(draft.ownerLastName, text(user.lastName)),
    ownerPhone: text(draft.ownerPhone, text(user.phoneNumber)),
    ownerEmail: account.email ?? text(user.email),
    businessName: text(draft.businessName),
    businessEmail: text(draft.businessEmail, account.email ?? ""),
    businessPhone: text(draft.businessPhone),
    description: text(draft.description),
    providerServiceType: ["catering", "addon", "both"].includes(
      String(draft.providerServiceType),
    )
      ? draft.providerServiceType as "catering" | "addon" | "both"
      : "catering",
    providerCategory: text(draft.providerCategory, "catering_service"),
    serviceCategories: enumList(
      draft.serviceCategories,
      PROVIDER_SERVICE_CATEGORIES,
    ) as ProviderServiceCategory[],
    address: text(draft.address),
    city: text(draft.city, "Ormoc City"),
    province: text(draft.province, "Leyte"),
    locationCoordinates: safeCoordinates,
    serviceAreas: stringList(draft.serviceAreas),
    maxServiceDistanceKm:
      typeof draft.maxServiceDistanceKm === "number" &&
      Number.isFinite(draft.maxServiceDistanceKm)
        ? draft.maxServiceDistanceKm
        : null,
    eventTypesSupported: enumList(
      draft.eventTypesSupported,
      PROVIDER_EVENT_TYPES,
    ) as ProviderEventType[],
    minGuestsPerEvent: integer(draft.minGuestsPerEvent, 1),
    maxGuestsPerEvent: integer(draft.maxGuestsPerEvent, 0),
    acceptsMultipleEventsPerDay:
      draft.acceptsMultipleEventsPerDay === true,
    maxEventsPerDay: integer(draft.maxEventsPerDay, 1),
    availableStaffCount: integer(draft.availableStaffCount, 0),
    availableEquipmentCount: integer(draft.availableEquipmentCount, 0),
    operatingDays: enumList(
      draft.operatingDays,
      PROVIDER_OPERATING_DAYS,
    ) as ProviderOperatingDay[],
    bookingLeadTimeDays: integer(draft.bookingLeadTimeDays, 0),
    unavailableDates: stringList(draft.unavailableDates),
    logoStoragePath: text(draft.logoStoragePath) || null,
    coverStoragePath: text(draft.coverStoragePath) || null,
    acceptedTerms: user.termsAcceptedAt != null,
    acceptedPrivacy: user.privacyAcceptedAt != null,
    termsPolicyVersion: text(
      user.termsPolicyVersion,
      text(draft.termsPolicyVersion, "unversioned"),
    ),
    privacyPolicyVersion: text(
      user.privacyPolicyVersion,
      text(draft.privacyPolicyVersion, "unversioned"),
    ),
    completedSteps: Array.isArray(draft.completedSteps)
      ? draft.completedSteps.filter(
          (step): step is number =>
            typeof step === "number" &&
            Number.isInteger(step) &&
            step >= 1 &&
            step <= 6,
        )
      : [],
  };
}

export function safeAccountReturnPath(
  value: unknown,
  account: SessionUser,
): string {
  return safeReturnPathForAccount(value, account);
}

export function destroySession(
  response: NextResponse,
  options: {clearCsrf?: boolean} = {},
): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions,
    maxAge: 0,
  });
  if (options.clearCsrf !== false) {
    response.cookies.set(CSRF_COOKIE_NAME, "", {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });
  }
}

export async function loadTrustedAccountContext(
  uid: string,
): Promise<SessionUser> {
  const [authUser, userSnapshot] = await Promise.all([
    adminAuth.getUser(uid),
    adminDb.collection("users").doc(uid).get(),
  ]);
  const userProfile = userSnapshot.exists ? userSnapshot.data() ?? null : null;
  const providerId = userProfile?.role === "provider" &&
    typeof userProfile.providerId === "string" &&
    userProfile.providerId.trim().length > 0
    ? userProfile.providerId.trim()
    : null;
  const providerSnapshot = providerId
    ? await adminDb.collection("providers").doc(providerId).get()
    : null;
  const providerProfile = providerSnapshot?.exists
    ? {id: providerSnapshot.id, ...providerSnapshot.data()}
    : null;
  const customerSnapshot = userProfile?.role === "customer"
    ? await adminDb.collection("customers").doc(uid).get()
    : null;

  const resolution = resolveTrustedAccountContext({
    uid,
    auth: {
      disabled: authUser.disabled,
      email: authUser.email ?? null,
      emailVerified: authUser.emailVerified,
    },
    userProfile,
    customerProfileExists: customerSnapshot?.exists === true,
    providerProfile,
  });
  if (!resolution.ok) {
    logWebSecurityEvent({
      action: "account_access_denied",
      outcome: "denied",
      actorUid: uid,
      targetId: uid,
      reasonCode: resolution.reason,
    });
    throw new AccountAccessError(resolution.reason);
  }
  const trustedEmail = authUser.email ?? null;
  const trustedEmailVerified = authUser.emailVerified;
  if (
    userProfile?.email !== trustedEmail ||
    userProfile?.isEmailVerified !== trustedEmailVerified
  ) {
    await synchronizeTrustedAuthFields({
      uid,
      role: resolution.account.role,
      email: trustedEmail,
      emailVerified: trustedEmailVerified,
    });
  }
  return {
    ...resolution.account,
    email: trustedEmail,
    emailVerified: trustedEmailVerified,
  };
}

export function homeForAccount(account: SessionUser): string {
  return accountHomePath(account.role);
}

async function synchronizeTrustedAuthFields(input: {
  uid: string;
  role: UserRole;
  email: string | null;
  emailVerified: boolean;
}): Promise<void> {
  const userReference = adminDb.collection("users").doc(input.uid);
  const customerReference = adminDb.collection("customers").doc(input.uid);
  await adminDb.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userReference);
    if (!userSnapshot.exists || userSnapshot.data()?.role !== input.role) {
      throw new AccountAccessError("missing_user_profile");
    }
    const customerSnapshot = input.role === "customer"
      ? await transaction.get(customerReference)
      : null;
    const emailChanged = userSnapshot.data()?.email !== input.email;
    const timestamp = FieldValue.serverTimestamp();
    transaction.update(userReference, {
      email: input.email,
      isEmailVerified: input.emailVerified,
      updatedAt: timestamp,
    });
    if (customerSnapshot?.exists) {
      transaction.update(customerReference, {
        email: input.email,
        updatedAt: timestamp,
      });
    }
    if (emailChanged) {
      transaction.create(adminDb.collection("adminLogs").doc(), {
        actorId: input.uid,
        actorRole: input.role,
        action: "account_email_synchronized",
        targetCollection: "users",
        targetId: input.uid,
        source: "web_session",
        createdAt: timestamp,
      });
      transaction.create(adminDb.collection("notifications").doc(), {
        userId: input.uid,
        title: "Email address updated",
        message: "Your verified account email was updated.",
        type: "account",
        relatedId: input.uid,
        relatedCollection: "users",
        isRead: false,
        readAt: null,
        createdAt: timestamp,
      });
    }
  });
}
