export const AGREEMENT_TYPES = "agreementTypes";

// "custom" stays parseable so an already-stored agreementTypes/custom_agreement
// document does not crash readers. It is not seeded and is not trusted.
export const AGREEMENT_PURPOSES = [
  "provider_onboarding",
  "platform_terms",
  "privacy_notice",
  "custom",
] as const;

export type AgreementPurpose = (typeof AGREEMENT_PURPOSES)[number];

export const AGREEMENT_AUDIENCES = ["provider", "platform", "custom"] as const;

export type AgreementAudience = (typeof AGREEMENT_AUDIENCES)[number];

export type AgreementTypeRecord = {
  code: string;
  name: string;
  description: string;
  purpose: AgreementPurpose;
  singleton: boolean;
  requiresAcceptance: boolean;
  targetAudience: AgreementAudience;
  system: boolean;
  isActive: boolean;
  sortOrder: number;
};

const CODE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;

export function initialAgreementTypes(): AgreementTypeRecord[] {
  return [
    {
      code: "provider_agreement",
      name: "Provider Agreement",
      description: "Agreement providers review and accept during onboarding.",
      purpose: "provider_onboarding",
      singleton: true,
      requiresAcceptance: true,
      targetAudience: "provider",
      system: true,
      isActive: true,
      sortOrder: 10,
    },
    {
      code: "terms_of_service",
      name: "Terms of Service",
      description: "Rules governing use of the FEASTA platform.",
      purpose: "platform_terms",
      singleton: true,
      requiresAcceptance: false,
      targetAudience: "platform",
      system: true,
      isActive: true,
      sortOrder: 20,
    },
    {
      code: "privacy_policy",
      name: "Privacy Policy",
      description: "Explains FEASTA's handling of personal information.",
      purpose: "privacy_notice",
      singleton: true,
      requiresAcceptance: false,
      targetAudience: "platform",
      system: true,
      isActive: true,
      sortOrder: 30,
    },
  ];
}

export function parseAgreementType(
  id: string,
  data: Record<string, unknown>,
): AgreementTypeRecord | null {
  if (!CODE_PATTERN.test(id) || id.length < 2 || id.length > 100) return null;
  if (typeof data.code === "string" && data.code !== id) return null;
  if (typeof data.name !== "string") return null;
  const name = data.name.trim();
  if (name.length < 2 || name.length > 120) return null;
  if (!isPurpose(data.purpose) || typeof data.singleton !== "boolean") return null;
  if (typeof data.requiresAcceptance !== "boolean") return null;
  if (!isAudience(data.targetAudience) || typeof data.system !== "boolean") {
    return null;
  }
  if (typeof data.isActive !== "boolean") return null;
  if (!isSortOrder(data.sortOrder)) return null;
  const description = typeof data.description === "string" ?
    data.description.trim() :
    "";
  if (description.length > 500) return null;
  return {
    code: id,
    name,
    description,
    purpose: data.purpose,
    singleton: data.singleton,
    requiresAcceptance: data.requiresAcceptance,
    targetAudience: data.targetAudience,
    system: data.system,
    isActive: data.isActive,
    sortOrder: data.sortOrder,
  };
}

export function isTrustedAgreementType(type: AgreementTypeRecord): boolean {
  const contract = initialAgreementTypes().find((entry) => entry.code === type.code);
  if (!contract || type.system !== true) return false;
  return type.purpose === contract.purpose &&
    type.singleton === contract.singleton &&
    type.requiresAcceptance === contract.requiresAcceptance &&
    type.targetAudience === contract.targetAudience;
}

export function providerOnboardingType(
  types: readonly AgreementTypeRecord[],
): AgreementTypeRecord | null {
  const matches = types.filter((type) =>
    isTrustedAgreementType(type) && type.purpose === "provider_onboarding",
  );
  return matches.length === 1 ? matches[0] : null;
}

function isPurpose(value: unknown): value is AgreementPurpose {
  return typeof value === "string" &&
    (AGREEMENT_PURPOSES as readonly string[]).includes(value);
}

function isAudience(value: unknown): value is AgreementAudience {
  return typeof value === "string" &&
    (AGREEMENT_AUDIENCES as readonly string[]).includes(value);
}

function isSortOrder(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 1000;
}
