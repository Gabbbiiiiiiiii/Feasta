"use client";

import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import {
  httpsCallable,
} from "firebase/functions";

import {
  ADDON_PRICING_TYPES,
  PROVIDER_SERVICE_CATEGORIES,
  type AddonPricingType,
  type ProviderServiceCategory,
} from "@feasta/shared-types";

import {
  WebAuthenticationError,
} from "@/lib/auth/client-session";
import {
  auth,
  db,
  functions,
} from "@/lib/firebase/client";

export type ProviderServiceStatus =
  | "draft"
  | "published"
  | "archived";

export type ProviderServiceInput = {
  name: string;
  description: string;
  category: ProviderServiceCategory;
  pricingType: AddonPricingType;
  price: number | null;
  imageUrl: string;
};

export type ProviderService = {
  id: string;
  providerId: string;

  name: string;
  description: string;

  category: ProviderServiceCategory;
  pricingType: AddonPricingType;
  price: number | null;

  imageUrl: string;

  status: ProviderServiceStatus;

  isActive: boolean;
  isAvailable: boolean;
  isPublished: boolean;
  isDeleted: boolean;
};

type ServiceMutationResponse = {
  success: boolean;
  serviceId: string;
  status: ProviderServiceStatus;
};

export async function listProviderServices(
  providerId: string,
): Promise<ProviderService[]> {
  await requireProviderAuthUser();

  const normalizedProviderId =
    requireDocumentId(
      providerId,
      "providerId",
    );

  const servicesQuery =
    query(
      collection(
        db,
        "addons",
      ),
      where(
        "providerId",
        "==",
        normalizedProviderId,
      ),
      orderBy(
        "createdAt",
        "desc",
      ),
    );

  const snapshot =
    await getDocs(
      servicesQuery,
    );

  return snapshot.docs
    .map(
      (document) =>
        parseProviderService(
          document.id,
          document.data(),
        ),
    )
    .filter(
      (
        service,
      ): service is ProviderService =>
        service !== null,
    );
}

export async function createProviderService(
  input: ProviderServiceInput,
): Promise<ServiceMutationResponse> {
  await requireProviderAuthUser();

  return callServiceMutation(
    "createProviderService",
    normalizeServiceInput(
      input,
    ),
  );
}

export async function updateProviderService(
  serviceId: string,
  input: ProviderServiceInput,
): Promise<ServiceMutationResponse> {
  await requireProviderAuthUser();

  return callServiceMutation(
    "updateProviderService",
    {
      serviceId:
        requireDocumentId(
          serviceId,
          "serviceId",
        ),

      ...normalizeServiceInput(
        input,
      ),
    },
  );
}

export async function publishProviderService(
  serviceId: string,
): Promise<ServiceMutationResponse> {
  await requireProviderAuthUser();

  return callServiceMutation(
    "publishProviderService",
    {
      serviceId:
        requireDocumentId(
          serviceId,
          "serviceId",
        ),
    },
  );
}

export async function archiveProviderService(
  serviceId: string,
): Promise<ServiceMutationResponse> {
  await requireProviderAuthUser();

  return callServiceMutation(
    "archiveProviderService",
    {
      serviceId:
        requireDocumentId(
          serviceId,
          "serviceId",
        ),
    },
  );
}

function normalizeServiceInput(
  input: ProviderServiceInput,
): Record<string, unknown> {
  const pricingType =
    requirePricingType(
      input.pricingType,
    );

  const category =
    requireServiceCategory(
      input.category,
    );

  return {
    name:
      requireText(
        input.name,
        "name",
        160,
      ),

    description:
      normalizeOptionalText(
        input.description,
        1000,
      ),

    category,

    pricingType,

    price:
      normalizePrice(
        input.price,
        pricingType,
      ),

    imageUrl:
      normalizeImageUrl(
        input.imageUrl,
      ),
  };
}

function parseProviderService(
  id: string,
  value: unknown,
): ProviderService | null {
  const data =
    recordValue(value);

  if (
    data.isDeleted === true
  ) {
    return null;
  }

  return {
    id,

    providerId:
      requiredString(
        data.providerId,
        "providerId",
      ),

    name:
      requiredString(
        data.name,
        "name",
      ),

    description:
      optionalString(
        data.description,
      ),

    category:
      requireServiceCategory(
        data.category,
      ),

    pricingType:
      requirePricingType(
        data.pricingType,
      ),

    price:
      parseStoredPrice(
        data.price,
        data.pricingType,
      ),

    imageUrl:
      optionalString(
        data.imageUrl,
      ),

    status:
      serviceStatus(
        data.status,
      ),

    isActive:
      data.isActive === true,

    isAvailable:
      data.isAvailable === true,

    isPublished:
      data.isPublished === true,

    isDeleted:
      data.isDeleted === true,
  };
}

async function callServiceMutation(
  name:
    | "createProviderService"
    | "updateProviderService"
    | "publishProviderService"
    | "archiveProviderService",
  data: Record<string, unknown>,
): Promise<ServiceMutationResponse> {
  const callable =
    httpsCallable<
      Record<string, unknown>,
      ServiceMutationResponse
    >(
      functions,
      name,
    );

  const response =
    await callable(data);

  return response.data;
}

async function requireProviderAuthUser() {
  await auth.authStateReady();

  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Please sign in again to continue.",
      "session_expired",
    );
  }

  return auth.currentUser;
}

function requireServiceCategory(
  value: unknown,
): ProviderServiceCategory {
  if (
    typeof value === "string" &&
    PROVIDER_SERVICE_CATEGORIES.includes(
      value as ProviderServiceCategory,
    )
  ) {
    return value as ProviderServiceCategory;
  }

  throw new WebAuthenticationError(
    "The service category is invalid.",
    "validation",
  );
}

function requirePricingType(
  value: unknown,
): AddonPricingType {
  if (
    typeof value === "string" &&
    ADDON_PRICING_TYPES.includes(
      value as AddonPricingType,
    )
  ) {
    return value as AddonPricingType;
  }

  throw new WebAuthenticationError(
    "The pricing type is invalid.",
    "validation",
  );
}

function normalizePrice(
  value: number | null,
  pricingType: AddonPricingType,
): number | null {
  if (
    pricingType ===
      "custom_quote"
  ) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100_000_000
  ) {
    throw new WebAuthenticationError(
      "The service price is invalid.",
      "validation",
    );
  }

  return value;
}

function parseStoredPrice(
  value: unknown,
  pricingTypeValue: unknown,
): number | null {
  const pricingType =
    requirePricingType(
      pricingTypeValue,
    );

  if (
    pricingType ===
      "custom_quote"
  ) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw invalidServiceRecord();
  }

  return value;
}

function serviceStatus(
  value: unknown,
): ProviderServiceStatus {
  if (
    value === "draft" ||
    value === "published" ||
    value === "archived"
  ) {
    return value;
  }

  throw invalidServiceRecord();
}

function requireDocumentId(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new WebAuthenticationError(
      `${field} is invalid.`,
      "validation",
    );
  }

  const normalized =
    value.trim();

  if (
    normalized.length < 1 ||
    normalized.length > 128 ||
    normalized.includes("/") ||
    !/^[A-Za-z0-9_-]+$/u.test(
      normalized,
    )
  ) {
    throw new WebAuthenticationError(
      `${field} is invalid.`,
      "validation",
    );
  }

  return normalized;
}

function requireText(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new WebAuthenticationError(
      `The service ${field} is invalid.`,
      "validation",
    );
  }

  const normalized =
    value
      .trim()
      .replace(/\s+/gu, " ");

  if (
    normalized.length < 1 ||
    normalized.length >
      maximumLength
  ) {
    throw new WebAuthenticationError(
      `The service ${field} is invalid.`,
      "validation",
    );
  }

  return normalized;
}

function normalizeOptionalText(
  value: unknown,
  maximumLength: number,
): string {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value
    .trim()
    .replace(/\s+/gu, " ")
    .slice(
      0,
      maximumLength,
    );
}

function normalizeImageUrl(
  value: unknown,
): string {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  if (
    typeof value !== "string"
  ) {
    throw new WebAuthenticationError(
      "The service image URL is invalid.",
      "validation",
    );
  }

  try {
    const url =
      new URL(
        value.trim(),
      );

    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      url.hash !== ""
    ) {
      throw new Error();
    }

    return url.toString();
  } catch {
    throw new WebAuthenticationError(
      "The service image URL must be a valid HTTPS URL.",
      "validation",
    );
  }
}

function recordValue(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw invalidServiceRecord();
  }

  return value as
    Record<string, unknown>;
}

function requiredString(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim() === ""
  ) {
    throw new WebAuthenticationError(
      `The service ${field} is invalid.`,
      "configuration",
    );
  }

  return value.trim();
}

function optionalString(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function invalidServiceRecord():
WebAuthenticationError {
  return new WebAuthenticationError(
    "An event service record contains invalid data.",
    "configuration",
  );
}