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
  WebAuthenticationError,
} from "@/lib/auth/client-session";
import {
  auth,
  db,
  functions,
} from "@/lib/firebase/client";

export type ProviderPackageStatus =
  | "draft"
  | "published"
  | "archived";

export type ProviderPackageInput = {
  name: string;
  description: string;
  eventType: string;

  price: number;
  downPaymentPercentage: number;

  minimumGuests: number;
  maximumGuests: number;

  imageUrl: string;

  foodInclusions: string[];
  decorInclusions: string[];
  furnitureInclusions: string[];
  serviceInclusions: string[];
};

export type ProviderPackage = {
  id: string;
  providerId: string;

  name: string;
  description: string;
  eventType: string;

  price: number;
  downPaymentPercentage: number;

  minimumGuests: number;
  maximumGuests: number;

  imageUrl: string;

  foodInclusions: string[];
  decorInclusions: string[];
  furnitureInclusions: string[];
  serviceInclusions: string[];

  status: ProviderPackageStatus;

  isActive: boolean;
  isPublished: boolean;
  providerPubliclyVisible: boolean;
};

type PackageMutationResponse = {
  success: boolean;
  packageId: string;
  status: ProviderPackageStatus;
};

export async function listProviderPackages(
  providerId: string,
): Promise<ProviderPackage[]> {
  await requireProviderAuthUser();

  const normalizedProviderId =
    requireDocumentId(
      providerId,
      "providerId",
    );

  const packagesQuery = query(
    collection(db, "packages"),
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
    await getDocs(packagesQuery);

  return snapshot.docs.map(
    (document) =>
      parseProviderPackage(
        document.id,
        document.data(),
      ),
  );
}

export async function createProviderPackage(
  input: ProviderPackageInput,
): Promise<PackageMutationResponse> {
  await requireProviderAuthUser();

  return callPackageMutation(
    "createProviderPackage",
    normalizePackageInput(input),
  );
}

export async function updateProviderPackage(
  packageId: string,
  input: ProviderPackageInput,
): Promise<PackageMutationResponse> {
  await requireProviderAuthUser();

  return callPackageMutation(
    "updateProviderPackage",
    {
      packageId:
        requireDocumentId(
          packageId,
          "packageId",
        ),

      ...normalizePackageInput(
        input,
      ),
    },
  );
}

export async function publishProviderPackage(
  packageId: string,
): Promise<PackageMutationResponse> {
  await requireProviderAuthUser();

  return callPackageMutation(
    "publishProviderPackage",
    {
      packageId:
        requireDocumentId(
          packageId,
          "packageId",
        ),
    },
  );
}

export async function archiveProviderPackage(
  packageId: string,
): Promise<PackageMutationResponse> {
  await requireProviderAuthUser();

  return callPackageMutation(
    "archiveProviderPackage",
    {
      packageId:
        requireDocumentId(
          packageId,
          "packageId",
        ),
    },
  );
}

function normalizePackageInput(
  input: ProviderPackageInput,
): Record<string, unknown> {
  return {
    name: input.name.trim(),

    description:
      input.description.trim(),

    eventType:
      input.eventType.trim(),

    price:
      input.price,

    downPaymentPercentage:
      input.downPaymentPercentage,

    minimumGuests:
      input.minimumGuests,

    maximumGuests:
      input.maximumGuests,

    imageUrl:
      input.imageUrl.trim(),

    foodInclusions:
      normalizeStringArray(
        input.foodInclusions,
      ),

    decorInclusions:
      normalizeStringArray(
        input.decorInclusions,
      ),

    furnitureInclusions:
      normalizeStringArray(
        input.furnitureInclusions,
      ),

    serviceInclusions:
      normalizeStringArray(
        input.serviceInclusions,
      ),
  };
}

function parseProviderPackage(
  id: string,
  value: unknown,
): ProviderPackage {
  const data =
    recordValue(value);

  const status =
    packageStatus(
      data.status,
    );

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

    eventType:
      requiredString(
        data.eventType,
        "eventType",
      ),

    price:
      requiredNonNegativeNumber(
        data.price,
        "price",
      ),

    downPaymentPercentage:
      requiredNonNegativeNumber(
        data.downPaymentPercentage,
        "downPaymentPercentage",
      ),

    minimumGuests:
      requiredNonNegativeInteger(
        data.minimumGuests,
        "minimumGuests",
      ),

    maximumGuests:
      requiredNonNegativeInteger(
        data.maximumGuests,
        "maximumGuests",
      ),

    imageUrl:
      optionalString(
        data.imageUrl,
      ),

    foodInclusions:
      stringArray(
        data.foodInclusions,
      ),

    decorInclusions:
      stringArray(
        data.decorInclusions,
      ),

    furnitureInclusions:
      stringArray(
        data.furnitureInclusions,
      ),

    serviceInclusions:
      stringArray(
        data.serviceInclusions,
      ),

    status,

    isActive:
      data.isActive === true,

    isPublished:
      data.isPublished === true,

    providerPubliclyVisible:
      data.providerPubliclyVisible ===
      true,
  };
}

async function callPackageMutation(
  name:
    | "createProviderPackage"
    | "updateProviderPackage"
    | "publishProviderPackage"
    | "archiveProviderPackage",
  data: Record<string, unknown>,
): Promise<PackageMutationResponse> {
  const callable = httpsCallable<
    Record<string, unknown>,
    PackageMutationResponse
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

function requireDocumentId(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string") {
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

function recordValue(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw invalidPackageRecord();
  }

  return value as Record<
    string,
    unknown
  >;
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
      `The package ${field} is invalid.`,
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

function requiredNonNegativeNumber(
  value: unknown,
  field: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new WebAuthenticationError(
      `The package ${field} is invalid.`,
      "configuration",
    );
  }

  return value;
}

function requiredNonNegativeInteger(
  value: unknown,
  field: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 0
  ) {
    throw new WebAuthenticationError(
      `The package ${field} is invalid.`,
      "configuration",
    );
  }

  return value as number;
}

function stringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (entry): entry is string =>
        typeof entry === "string",
    )
    .map(
      (entry) =>
        entry.trim(),
    )
    .filter(Boolean);
}

function normalizeStringArray(
  value: readonly string[],
): string[] {
  return value
    .map(
      (entry) =>
        entry.trim(),
    )
    .filter(Boolean);
}

function packageStatus(
  value: unknown,
): ProviderPackageStatus {
  if (
    value === "draft" ||
    value === "published" ||
    value === "archived"
  ) {
    return value;
  }

  throw invalidPackageRecord();
}

function invalidPackageRecord():
  WebAuthenticationError {
  return new WebAuthenticationError(
    "A package record contains invalid data.",
    "configuration",
  );
}