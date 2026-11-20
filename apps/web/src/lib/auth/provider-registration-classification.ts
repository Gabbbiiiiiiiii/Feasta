import {
  normalizePhilippineMobile,
  parseAccountStatus,
  parseProviderServiceType,
  parseProviderVerificationStatus,
  parseUserRole,
  type ProviderAccountClassification,
} from "@feasta/shared-types";

export interface ProviderRegistrationRecordInput {
  uid: string;
  authPhoneNumber: string;
  userProfile: Record<string, unknown> | null;
  customerProfileExists: boolean;
  ownedProviderProfiles: Array<Record<string, unknown> & {id: string}>;
  linkedProviderProfile: (Record<string, unknown> & {id: string}) | null;
}

export function classifyProviderRegistrationRecords(
  input: ProviderRegistrationRecordInput,
): ProviderAccountClassification {
  const profile = input.userProfile;
  if (!profile) {
    return input.customerProfileExists || input.ownedProviderProfiles.length > 0
      ? "malformed_provider_relationship"
      : "auth_only";
  }

  const role = parseUserRole(profile.role);
  if (role === "customer" || role === "admin") return "non_provider_account";
  if (role !== "provider") return "malformed_provider_relationship";
  if (input.customerProfileExists) return "malformed_provider_relationship";

  if (
    parseAccountStatus(profile.accountStatus) !== "active" ||
    profile.isActive !== true ||
    profile.isBlocked !== false ||
    normalizePhilippineMobile(profile.phoneNumber) !== input.authPhoneNumber
  ) {
    return "malformed_provider_relationship";
  }

  const providerId = typeof profile.providerId === "string"
    ? profile.providerId.trim()
    : "";
  if (!providerId) {
    return input.ownedProviderProfiles.length === 0
      ? "provider_identity"
      : "malformed_provider_relationship";
  }

  const provider = input.linkedProviderProfile;
  if (
    !provider ||
    provider.id !== providerId ||
    provider.ownerId !== input.uid ||
    !parseProviderVerificationStatus(provider.verificationStatus) ||
    !parseProviderServiceType(provider.providerServiceType) ||
    input.ownedProviderProfiles.length !== 1 ||
    input.ownedProviderProfiles[0]?.id !== providerId
  ) {
    return "malformed_provider_relationship";
  }

  return "registered_provider";
}
