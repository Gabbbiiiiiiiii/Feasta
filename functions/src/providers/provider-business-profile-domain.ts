import {HttpsError} from "firebase-functions/v2/https";

import {
  requireObject,
  requirePhilippinePhone,
  requireString,
} from "../shared/validation.js";

export const PROVIDER_BUSINESS_PROFILE_EDITABLE_FIELDS = [
  "businessPhone",
  "description",
  "address",
  "city",
  "province",
  "logo",
  "coverImage",
] as const;

export type ProviderBusinessMediaUpdate = {
  url: string;
  publicId: string;
};

export type ValidatedProviderBusinessProfileUpdate = {
  businessPhone?: string;
  description?: string;
  address?: string;
  city?: string;
  province?: string;
  logo?: ProviderBusinessMediaUpdate | null;
  coverImage?: ProviderBusinessMediaUpdate | null;
};

export function validateProviderBusinessProfileUpdate(
  value: unknown,
): ValidatedProviderBusinessProfileUpdate {
  const input = requireObject(value);
  rejectUnknownFields(input, PROVIDER_BUSINESS_PROFILE_EDITABLE_FIELDS);

  const output: ValidatedProviderBusinessProfileUpdate = {};

  if ("businessPhone" in input) {
    output.businessPhone = requirePhilippinePhone(
      input.businessPhone,
      "businessPhone",
    );
  }
  if ("description" in input) {
    output.description = requireString(input.description, "description", {
      minLength: 20,
      maxLength: 2000,
    });
  }
  if ("address" in input) {
    output.address = requireString(input.address, "address", {
      minLength: 3,
      maxLength: 250,
    });
  }
  if ("city" in input) {
    output.city = requireString(input.city, "city", {
      minLength: 2,
      maxLength: 100,
    });
  }
  if ("province" in input) {
    output.province = requireString(input.province, "province", {
      minLength: 2,
      maxLength: 100,
    });
  }
  if ("logo" in input) {
    output.logo = providerMedia(input.logo, "logo");
  }
  if ("coverImage" in input) {
    output.coverImage = providerMedia(input.coverImage, "coverImage");
  }

  if (Object.keys(output).length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "At least one editable business profile field is required.",
    );
  }

  return output;
}

function providerMedia(
  value: unknown,
  field: "logo" | "coverImage",
): ProviderBusinessMediaUpdate | null {
  if (value === null) return null;
  const media = requireObject(value, field);
  rejectUnknownFields(media, ["url", "publicId"]);

  return {
    url: requireString(media.url, `${field}.url`, {
      minLength: 1,
      maxLength: 1000,
    }),
    publicId: requireString(media.publicId, `${field}.publicId`, {
      minLength: 1,
      maxLength: 500,
    }),
  };
}

function rejectUnknownFields(
  input: Readonly<Record<string, unknown>>,
  allowedFields: readonly string[],
): void {
  const allowed = new Set(allowedFields);
  const unknown = Object.keys(input).filter((field) => !allowed.has(field));

  if (unknown.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      `Unsupported business profile fields: ${unknown.join(", ")}.`,
    );
  }
}
