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
  isServiceCategoryCode,
  type ServiceCategoryCode,
} from "@feasta/shared-types";

import {
  WebAuthenticationError,
} from "@/lib/auth/client-session";
import {
  normalizePackageServiceOptions,
  normalizePackageThemeOptions,
  type PackageServiceOptions,
  type PackageThemeOption,
} from "@/lib/catering/package-offer-configuration";
import {
  auth,
  db,
  functions,
} from "@/lib/firebase/client";

import type {OfferV2} from "@feasta/shared-types/provider-package-v2";
import {packageV2Enabled, packageV2PublicationEnabled} from "./provider-package-v2-client";
import {parseFoodChoiceGroupsV2} from "./food-choice-groups-v2";
export type ProviderPackageV2 = {revision:number; occasionScope:"specific"|"all";
  occasionIds:string[]; serviceOptions:OfferV2["serviceOptions"]; equipmentInclusions:string[];
  foodChoiceGroups?:NonNullable<OfferV2["foodChoiceGroups"]>};
export type ProviderPackageStatus =
  | "draft"
  | "published"
  | "archived";

export type ProviderPackagePaymentPolicy =
  | "full_payment"
  | "deposit_then_balance";

export type ProviderPackageInput = {
  pricingModel?: "per_pax" | "per_bundle";
  name: string;
  description: string;
  eventType: string;
  serviceCategoryCode: string;

  price: number;
  serviceOptions: PackageServiceOptions;
  themeOptions: PackageThemeOption[];

  paymentPolicy:
    ProviderPackagePaymentPolicy;

  depositPercentage: number;

  balanceDueDaysBeforeEvent?:
    number | null;

  minimumGuests: number;
  maximumGuests: number;

  imageUrl: string;
  imageUrls?: string[];

  foodInclusions: string[];
  decorInclusions: string[];
  furnitureInclusions: string[];
  serviceInclusions: string[];
};

export type ProviderPackage = {
  v2?: ProviderPackageV2;
  pricingModel?: "per_pax" | "per_bundle";
  id: string;
  providerId: string;

  name: string;
  description: string;
  eventType: string;
  serviceCategoryCode:
    ServiceCategoryCode | null;

  price: number;
  serviceOptions: PackageServiceOptions;
  themeOptions: PackageThemeOption[];

  paymentPolicy:
    ProviderPackagePaymentPolicy | null;

  depositPercentage: number;

  balanceDueDaysBeforeEvent:
    number | null;

  /*
   * Temporary compatibility field while the
   * booking/provider-request migration still
   * consumes the legacy percentage.
   */
  downPaymentPercentage: number;

  minimumGuests: number;
  maximumGuests: number;

  imageUrl: string;
  imageUrls?: string[];

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

const publicationKeys = new Map<string, string>();
export async function publishProviderPackage(
  packageId: string,
  v2?: ProviderPackageV2,
): Promise<PackageMutationResponse> {
  await requireProviderAuthUser();

  if (v2 && !packageV2PublicationEnabled) throw new Error("FEATURE_DISABLED");
  const key = `${auth.currentUser?.uid}:${packageId}:${v2?.revision}`;
  if (v2 && !publicationKeys.has(key)) publicationKeys.set(key, `v2_publish_${crypto.randomUUID()}`);
  return callPackageMutation(
    "publishProviderPackage",
    {
      ...(v2 ? {sharedContractVersion: 2, expectedRevision: v2.revision, idempotencyKey: publicationKeys.get(key)} : {}),
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
  if (["occasionSchemaVersion", "occasionScope", "occasionIds", "occasionMatchIds", "occasionCatalogRevision", "providerEligibilityRevision", "occasionEligibilityState", "selectedOccasions"].some((field) => Object.hasOwn(input, field))) {
    throw new WebAuthenticationError("This selection requires the V2 package writer.", "configuration");
  }
  return {
    ...(input.pricingModel !== undefined ? {pricingModel: input.pricingModel} : {}),
    name: input.name.trim(),

    description:
      input.description.trim(),

    eventType:
      input.eventType.trim(),

    serviceCategoryCode:
      input.serviceCategoryCode.trim(),

    price:
      input.price,

    serviceOptions:
      input.serviceOptions,

    themeOptions:
      input.themeOptions,

    paymentPolicy:
      input.paymentPolicy,

    depositPercentage:
      input.depositPercentage,

    minimumGuests:
      input.minimumGuests,

    maximumGuests:
      input.maximumGuests,

    imageUrl:
      input.imageUrls?.[0] ?? input.imageUrl.trim(),
    ...(input.imageUrls !== undefined ? {imageUrls: input.imageUrls} : {}),

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

  const v2Fields = ["occasionSchemaVersion", "offerSchemaVersion", "occasionScope", "occasionIds",
    "occasionMatchIds", "occasionCatalogRevision", "providerEligibilityRevision", "occasionEligibilityState"];
  let v2: ProviderPackageV2 | undefined;
  if (v2Fields.some((field) => Object.hasOwn(data, field) && !(field === "offerSchemaVersion" && data[field] === 1))) {
    if (!packageV2Enabled || data.sharedContractVersion !== 2 || data.occasionSchemaVersion !== 2 ||
      data.offerSchemaVersion !== 2 || !Number.isSafeInteger(data.revision) || Number(data.revision) < 1 ||
      !["specific", "all"].includes(String(data.occasionScope)) || !Array.isArray(data.occasionIds) ||
      !data.occasionIds.every((id: unknown) => typeof id === "string") ||
      !["draft", "published", "archived"].includes(String(data.status)) ||
      (data.status === "published" ? data.isPublished !== true || data.isActive !== true || data.providerPubliclyVisible !== true :
        data.isPublished !== false || data.isActive !== false || data.providerPubliclyVisible !== false)) {
      throw new WebAuthenticationError("This package requires a compatible private V2 editor.", "configuration");
    }
    if (data.pricingModel !== undefined && data.pricingModel !== "per_pax" && data.pricingModel !== "per_bundle") throw invalidPackageRecord();
    if (new Set(data.occasionIds).size !== data.occasionIds.length ||
      (data.occasionScope === "all" ? data.occasionIds.length !== 0 : data.occasionIds.length === 0)) throw invalidPackageRecord();
    if (Object.hasOwn(data,"equipmentInclusions") && (!Array.isArray(data.equipmentInclusions) ||
      !data.equipmentInclusions.every((item: unknown) => typeof item === "string"))) throw invalidPackageRecord();
    const options = recordValue(data.serviceOptions);
    const serviceOptions: OfferV2["serviceOptions"] = {};
    for (const [tier, raw] of Object.entries(options)) {
      if (!["drop_off", "buffet_setup", "full_service"].includes(tier)) throw invalidPackageRecord();
      const row = recordValue(raw);
      if (Object.keys(row).some((key) => !["price", "includedServices", "decorInclusions", "furnitureInclusions", "equipmentInclusions"].includes(key))) throw invalidPackageRecord();
      if (!Array.isArray(row.includedServices) || !row.includedServices.every((item: unknown) => typeof item === "string")) throw invalidPackageRecord();
      const parsed = {price: requiredNonNegativeNumber(row.price, "tier price"), includedServices:stringArray(row.includedServices)};
      const extra: Record<string,string[]> = {};
      for (const field of ["decorInclusions", "furnitureInclusions", "equipmentInclusions"]) {
        if (Object.hasOwn(row,field)) {
          if (!Array.isArray(row[field]) || !(row[field] as unknown[]).every((item) => typeof item === "string")) throw invalidPackageRecord();
          extra[field] = [...row[field] as string[]];
        }
      }
      serviceOptions[tier as keyof typeof serviceOptions] = {...parsed,...extra};
    }
    v2 = {revision:Number(data.revision), occasionScope:data.occasionScope as "specific"|"all",
      occasionIds:[...data.occasionIds] as string[], serviceOptions,
      equipmentInclusions:stringArray(data.equipmentInclusions),
      foodChoiceGroups:Object.hasOwn(data,"foodChoiceGroups") ?
        parseFoodChoiceGroupsV2(data.foodChoiceGroups) : []};
  }

  const status =
    packageStatus(
      data.status,
    );

  const downPaymentPercentage =
    requiredNonNegativeNumber(
      data.downPaymentPercentage,
      "downPaymentPercentage",
    );

  const paymentPolicy =
    packagePaymentPolicy(
      data.paymentPolicy,
    );

  const depositPercentage =
    paymentPolicy === null
      ? downPaymentPercentage
      : requiredNonNegativeNumber(
          data.depositPercentage,
          "depositPercentage",
        );

  let balanceDueDaysBeforeEvent:
    number | null = null;

  if (
    paymentPolicy ===
    "full_payment"
  ) {
    if (
      depositPercentage !== 100 ||
      (
        data.balanceDueDaysBeforeEvent !==
          undefined &&
        data.balanceDueDaysBeforeEvent !==
          null
      )
    ) {
      throw invalidPackageRecord();
    }
  }

  if (
    paymentPolicy ===
    "deposit_then_balance"
  ) {
    if (
      depositPercentage <= 0 ||
      depositPercentage >= 100 ||
      downPaymentPercentage !==
        depositPercentage
    ) {
      throw invalidPackageRecord();
    }

    balanceDueDaysBeforeEvent = data.paymentTermsSchemaVersion === 2
      ? null : requiredNonNegativeInteger(
        data.balanceDueDaysBeforeEvent,
        "balanceDueDaysBeforeEvent",
      );

    if (
      balanceDueDaysBeforeEvent !== null && (balanceDueDaysBeforeEvent < 1 ||
      balanceDueDaysBeforeEvent > 365)
    ) {
      throw invalidPackageRecord();
    }
  }

  return {
    ...(v2 ? {v2} : {}),
    id,
    ...(data.pricingModel === "per_pax" || data.pricingModel === "per_bundle" ? {pricingModel: data.pricingModel} : {}),

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

    serviceCategoryCode:
      optionalServiceCategoryCode(
        data.serviceCategoryCode,
      ),

    price:
      requiredNonNegativeNumber(
        data.price,
        "price",
      ),

    serviceOptions:
      normalizePackageServiceOptions(
        data.serviceOptions,
      ),

    themeOptions:
      normalizePackageThemeOptions(
        data.themeOptions,
      ),

    paymentPolicy,

    depositPercentage,

    balanceDueDaysBeforeEvent,

    downPaymentPercentage,

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

    imageUrls: Array.isArray(data.imageUrls) ? stringArray(data.imageUrls).slice(0, 8) : undefined,

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

function optionalServiceCategoryCode(
  value: unknown,
): ServiceCategoryCode | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (!isServiceCategoryCode(value)) {
    throw invalidPackageRecord();
  }

  return value;
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

function packagePaymentPolicy(
  value: unknown,
): ProviderPackagePaymentPolicy | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    value === "full_payment" ||
    value ===
      "deposit_then_balance"
  ) {
    return value;
  }

  throw invalidPackageRecord();
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
