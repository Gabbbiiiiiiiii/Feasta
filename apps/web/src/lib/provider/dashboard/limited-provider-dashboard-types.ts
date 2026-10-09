import type {
  ProviderVerificationStatus,
} from "@feasta/shared-types";

export type LimitedProviderDashboardData = {
  mode: "identity-limited";
  displayName: string;
  email: string;
  phoneNumber: string;
  emailVerified: false;
  phoneVerified: true;
  providerIdentityStatus:
    | "identity_created"
    | ProviderVerificationStatus;
  nextAllowedAction: "verify_email";
};
