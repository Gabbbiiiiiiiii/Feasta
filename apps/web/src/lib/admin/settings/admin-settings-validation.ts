import type {
  UpdateAdminPlatformSettingsInput,
} from "@/lib/admin/settings/admin-settings-types";

const allowedInputKeys = new Set([
  "platformName",
  "operatingCity",
  "supportEmail",
  "serviceAreaDescription",
  "internalReason",
]);

const emailPattern =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export function validateAdminPlatformSettingsUpdate(
  value: unknown,
): UpdateAdminPlatformSettingsInput {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Platform settings are required.",
    );
  }

  const input = value as Record<
    string,
    unknown
  >;

  for (const key of Object.keys(input)) {
    if (!allowedInputKeys.has(key)) {
      throw new Error(
        `The platform setting "${key}" cannot be modified.`,
      );
    }
  }

  const platformName = requiredText(
    input.platformName,
    "Platform name",
    2,
    80,
  );

  const operatingCity = requiredText(
    input.operatingCity,
    "Operating city",
    2,
    120,
  );

  const supportEmail = requiredText(
    input.supportEmail,
    "Support email",
    5,
    254,
  ).toLowerCase();

  if (!emailPattern.test(supportEmail)) {
    throw new Error(
      "Enter a valid support email address.",
    );
  }

  const serviceAreaDescription = requiredText(
    input.serviceAreaDescription,
    "Service-area description",
    10,
    500,
  );

  const internalReason = requiredText(
    input.internalReason,
    "Internal administrative reason",
    10,
    1000,
  );

  return {
    platformName,
    operatingCity,
    supportEmail,
    serviceAreaDescription,
    internalReason,
  };
}

function requiredText(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number,
) {
  if (typeof value !== "string") {
    throw new Error(`${label} is required.`);
  }

  const normalized = value.trim();

  if (normalized.length < minimumLength) {
    throw new Error(
      `${label} must contain at least ${minimumLength} characters.`,
    );
  }

  if (normalized.length > maximumLength) {
    throw new Error(
      `${label} must not exceed ${maximumLength} characters.`,
    );
  }

  return normalized;
}