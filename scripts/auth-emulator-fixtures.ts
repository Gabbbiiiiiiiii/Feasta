export const AUTH_FIXTURE_MARKER = "feasta-phase6-auth-fixtures-v1";

export type AuthenticationFixtureAccount = {
  uid: string;
  email: string;
  role: "customer" | "provider" | "admin";
  emailVerified: boolean;
  disabled?: boolean;
  accountStatus?: "active" | "blocked" | "disabled" | "pending_deletion";
  isBlocked?: boolean;
  isPhoneVerified?: boolean;
  phoneNumber?: string;
  omitFirestoreProfile?: boolean;
  providerId?: string | null;
  providerVerificationStatus?:
    | "draft"
    | "submitted"
    | "under_review"
    | "resubmission_required"
    | "approved"
    | "rejected"
    | "suspended";
};

export const AUTH_FIXTURE_ACCOUNTS = [
  {
    uid: "dev-customer",
    email: "customer@feasta.test",
    role: "customer",
    emailVerified: true,
    isPhoneVerified: true,
    phoneNumber: "+639000000001",
  },
  {
    uid: "dev-customer-unverified",
    email: "customer.unverified@feasta.test",
    role: "customer",
    emailVerified: false,
  },
  {
    uid: "dev-customer-phone-unverified",
    email: "customer.phone-unverified@feasta.test",
    role: "customer",
    emailVerified: true,
  },
  {
    uid: "dev-customer-blocked",
    email: "customer.blocked@feasta.test",
    role: "customer",
    emailVerified: true,
    accountStatus: "blocked",
    isBlocked: true,
  },
  {
    uid: "dev-customer-deactivated",
    email: "customer.deactivated@feasta.test",
    role: "customer",
    emailVerified: true,
    accountStatus: "pending_deletion",
  },
  {
    uid: "dev-customer-missing-profile",
    email: "customer.missing-profile@feasta.test",
    role: "customer",
    emailVerified: true,
    omitFirestoreProfile: true,
  },
  {
    uid: "dev-provider-missing-setup",
    email: "provider.missing-setup@feasta.test",
    role: "provider",
    emailVerified: true,
    providerId: null,
  },
  {
    uid: "dev-provider-pending",
    email: "provider.pending@feasta.test",
    role: "provider",
    emailVerified: true,
    isPhoneVerified: true,
    phoneNumber: "+639000000010",
    providerId: "provider-pending",
    providerVerificationStatus: "draft",
  },
  {
    uid: "dev-provider-submitted",
    email: "provider.submitted@feasta.test",
    role: "provider",
    emailVerified: true,
    isPhoneVerified: true,
    phoneNumber: "+639000000011",
    providerId: "provider-submitted",
    providerVerificationStatus: "submitted",
  },
  {
    uid: "dev-provider-under-review",
    email: "provider.under-review@feasta.test",
    role: "provider",
    emailVerified: true,
    isPhoneVerified: true,
    phoneNumber: "+639000000012",
    providerId: "provider-under-review",
    providerVerificationStatus: "under_review",
  },
  {
    uid: "dev-provider-resubmission",
    email: "provider.resubmission@feasta.test",
    role: "provider",
    emailVerified: true,
    isPhoneVerified: true,
    phoneNumber: "+639000000013",
    providerId: "provider-resubmission",
    providerVerificationStatus: "resubmission_required",
  },
  {
    uid: "dev-provider-rejected",
    email: "provider.rejected@feasta.test",
    role: "provider",
    emailVerified: true,
    isPhoneVerified: true,
    phoneNumber: "+639000000014",
    providerId: "provider-rejected",
    providerVerificationStatus: "rejected",
  },
  {
    uid: "dev-provider-suspended",
    email: "provider.suspended@feasta.test",
    role: "provider",
    emailVerified: true,
    isPhoneVerified: true,
    phoneNumber: "+639000000015",
    providerId: "provider-suspended",
    providerVerificationStatus: "suspended",
  },
  {
    uid: "dev-provider-approved",
    email: "provider.approved@feasta.test",
    role: "provider",
    emailVerified: true,
    isPhoneVerified: true,
    phoneNumber: "+639000000016",
    providerId: "provider-approved",
    providerVerificationStatus: "approved",
  },
  {
    uid: "dev-provider-blocked",
    email: "provider.blocked@feasta.test",
    role: "provider",
    emailVerified: true,
    isPhoneVerified: true,
    phoneNumber: "+639000000017",
    accountStatus: "blocked",
    isBlocked: true,
    providerId: "provider-blocked",
    providerVerificationStatus: "approved",
  },
  {
    uid: "dev-admin",
    email: "admin@feasta.test",
    role: "admin",
    emailVerified: true,
  },
  {
    uid: "dev-admin-blocked",
    email: "admin.blocked@feasta.test",
    role: "admin",
    emailVerified: true,
    accountStatus: "blocked",
    isBlocked: true,
  },
  {
    uid: "dev-admin-disabled",
    email: "admin.disabled@feasta.test",
    role: "admin",
    emailVerified: true,
    accountStatus: "disabled",
    disabled: true,
  },
] as const satisfies readonly AuthenticationFixtureAccount[];

export const SEEDED_TOP_LEVEL_COLLECTIONS = [
  "users",
  "customers",
  "providers",
  "providerVerifications",
  "packages",
  "menuItems",
  "addons",
  "mainEvents",
  "providerRequests",
  "bookings",
  "payments",
  "notifications",
  "reviews",
  "complaints",
  "announcements",
  "appSettings",
] as const;
