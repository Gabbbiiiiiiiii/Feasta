import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  cloudinarySecrets,
  verifyProviderMedia,
} from "../shared/cloudinary.js";
import {
  PROVIDER_EVENT_TYPES,
  PROVIDER_OPERATING_DAYS,
  PROVIDER_SERVICE_CATEGORIES,
  PROVIDER_SERVICE_TYPES,
  USER_ROLES,
  providerCapacityCapabilities,
  serviceCategoryMatchesProviderType,
  type ProviderServiceCategory,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {
  requireBoolean,
  requireEnum,
  requireNumber,
  requireObject,
  requirePhilippineMobile,
  requirePhilippinePhone,
  requireString,
} from "../shared/validation.js";

const SETUP_STEPS = [1, 2, 3, 4, 5, 6] as const;

export const saveProviderOnboardingDraft = onCall(
  {
    ...appCheckCallableOptions,
    secrets: cloudinarySecrets,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.provider]);
    await enforceCallableRateLimit(request, {
      scope: "saveProviderOnboardingDraft",
      limit: 60,
      windowSeconds: 10 * 60,
    });

    const input = requireObject(request.data);
    rejectUnknownFields(input, ["step", "data"]);
    const step = requireNumber(input.step, "step", {min: 1, max: 6});
    if (!Number.isInteger(step)) {
      throw new HttpsError("invalid-argument", "step must be an integer.");
    }
    const data = requireObject(input.data, "data");
    let validated = validateStep(step, data, actor.uid);
    if (step === 2) {
      await Promise.all([
        verifyProviderMedia({
          ownerId: actor.uid,
          mediaType: "logo",
          url: validated.logoUrl,
          publicId:
            validated.logoPublicId,
          maximumBytes:
            5 * 1024 * 1024,
        }),
        verifyProviderMedia({
          ownerId: actor.uid,
          mediaType: "cover",
          url: validated.coverImageUrl,
          publicId:
            validated.coverPublicId,
          maximumBytes:
            10 * 1024 * 1024,
        }),
      ]);
    }
    const userReference = db.collection("users").doc(actor.uid);
    const draftReference = db
      .collection("providerOnboardingDrafts")
      .doc(actor.uid);

    return db.runTransaction(async (transaction) => {
      const [userSnapshot, draftSnapshot] = await transaction.getAll(
        userReference,
        draftReference,
      );
      const user = userSnapshot.data();
      if (
        !userSnapshot.exists ||
        user?.role !== USER_ROLES.provider ||
        user.accountStatus !== "active" ||
        user.isActive !== true ||
        user.isBlocked !== false
      ) {
        throw new HttpsError(
          "permission-denied",
          "The provider account is not active.",
        );
      }
      if (
        typeof user.providerId === "string" &&
        user.providerId.trim().length > 0
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Provider business setup is already complete.",
        );
      }

      const existing = draftSnapshot.data() ?? {};
      if (step === 5) {
        validated =
          normalizeStepFiveCapacity(
            validated,
            existing,
          );
      }
      const completed = new Set<number>(
        Array.isArray(existing.completedSteps)
          ? existing.completedSteps.filter(
              (value): value is number =>
                typeof value === "number" &&
                Number.isInteger(value) &&
                value >= 1 &&
                value <= 6,
            )
          : [],
      );
      const expected = firstIncompleteStep(completed);
      if (step > expected) {
        throw new HttpsError(
          "failed-precondition",
          `Complete onboarding step ${expected} first.`,
        );
      }
      completed.add(step);
      const completedSteps = [...completed].sort((left, right) => left - right);
      const nextStep = firstIncompleteStep(completed);

      transaction.set(
        draftReference,
        {
          ownerId: actor.uid,
          ...validated,
          completedSteps,
          currentStep: nextStep,
          createdAt: draftSnapshot.exists
            ? existing.createdAt ?? serverTimestamp()
            : serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        {merge: true},
      );

      if (step === 1) {
        transaction.update(userReference, {
          firstName: validated.ownerFirstName,
          lastName: validated.ownerLastName,
          phoneNumber: validated.ownerPhone,
          isPhoneVerified: false,
          phoneVerifiedAt: null,
          updatedAt: serverTimestamp(),
        });
      }
      if (step === 6) {
        transaction.update(userReference, {
          ...(user.termsAcceptedAt == null ? {
            termsAcceptedAt: serverTimestamp(),
            termsPolicyVersion: validated.termsPolicyVersion,
          } : {}),
          ...(user.privacyAcceptedAt == null ? {
            privacyAcceptedAt: serverTimestamp(),
            privacyPolicyVersion: validated.privacyPolicyVersion,
          } : {}),
          updatedAt: serverTimestamp(),
        });
      }

      return {
        success: true,
        completedSteps,
        nextStep,
      };
    });
  },
);

function validateStep(
  step: number,
  data: Record<string, unknown>,
  ownerId: string,
): Record<string, unknown> {
  switch (step) {
    case 1:
      rejectUnknownFields(data, [
        "ownerFirstName",
        "ownerLastName",
        "ownerPhone",
      ]);
      return {
        ownerFirstName: requireString(
          data.ownerFirstName,
          "ownerFirstName",
          {minLength: 1, maxLength: 80},
        ),
        ownerLastName: requireString(
          data.ownerLastName,
          "ownerLastName",
          {minLength: 1, maxLength: 80},
        ),
        ownerPhone: requirePhilippineMobile(data.ownerPhone),
      };
    case 2: {
      rejectUnknownFields(data, [
        "businessName",
        "businessEmail",
        "businessPhone",
        "description",
        "logoUrl",
        "logoPublicId",
        "coverImageUrl",
        "coverPublicId",
      ]);
      const businessEmail = requireString(
        data.businessEmail,
        "businessEmail",
        {minLength: 3, maxLength: 160},
      ).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(businessEmail)) {
        throw new HttpsError(
          "invalid-argument",
          "businessEmail must be valid.",
        );
      }
      return {
        businessName: requireString(data.businessName, "businessName", {
          minLength: 2,
          maxLength: 120,
        }),
        businessEmail,
        businessPhone: requirePhilippinePhone(
          data.businessPhone,
          "businessPhone",
        ),
        description: requireString(data.description, "description", {
          minLength: 20,
          maxLength: 2000,
        }),
      ...providerMediaFields(
          data,
          ownerId,
        ),
      };
    }
    case 3: {
      rejectUnknownFields(data, [
        "providerServiceType",
        "providerCategory",
        "serviceCategories",
        "eventTypesSupported",
      ]);
      const providerServiceType = requireEnum(
        data.providerServiceType,
        "providerServiceType",
        PROVIDER_SERVICE_TYPES,
      );
      const serviceCategories = requiredEnumList(
        data.serviceCategories,
        "serviceCategories",
        PROVIDER_SERVICE_CATEGORIES,
      );
      if (serviceCategories.some((category) =>
        !serviceCategoryMatchesProviderType(
          category as ProviderServiceCategory,
          providerServiceType,
        )
      )) {
        throw new HttpsError(
          "invalid-argument",
          "Every service category must match the selected provider service type.",
        );
      }
      const providerCategory = data.providerCategory === undefined
        ? serviceCategories[0]
        : requireString(data.providerCategory, "providerCategory", {
            minLength: 2,
            maxLength: 100,
          });
      if (providerCategory !== serviceCategories[0]) {
        throw new HttpsError(
          "invalid-argument",
          "providerCategory must match the primary service category.",
        );
      }
      return {
        providerServiceType,
        providerCategory,
        serviceCategories,
        eventTypesSupported: requiredEnumList(
          data.eventTypesSupported,
          "eventTypesSupported",
          PROVIDER_EVENT_TYPES,
        ),
      };
    }
    case 4:
      rejectUnknownFields(data, [
        "address",
        "city",
        "province",
        "serviceAreas",
        "maxServiceDistanceKm",
        "locationCoordinates",
      ]);
      return {
        address: requireString(data.address, "address", {
          minLength: 3,
          maxLength: 250,
        }),
        city: requireString(data.city, "city", {
          minLength: 2,
          maxLength: 100,
        }),
        province: requireString(data.province, "province", {
          minLength: 2,
          maxLength: 100,
        }),
        serviceAreas: requiredStringList(data.serviceAreas, "serviceAreas"),
        maxServiceDistanceKm: optionalNumber(
          data.maxServiceDistanceKm,
          "maxServiceDistanceKm",
          1,
          1000,
        ),
        locationCoordinates: optionalCoordinates(data.locationCoordinates),
      };
    case 5: {
      rejectUnknownFields(data, [
        "minGuestsPerEvent",
        "maxGuestsPerEvent",
        "acceptsMultipleEventsPerDay",
        "maxEventsPerDay",
        "availableStaffCount",
        "availableEquipmentCount",
        "operatingDays",
        "bookingLeadTimeDays",
        "unavailableDates",
      ]);
      const acceptsMultipleEventsPerDay = requireBoolean(
        data.acceptsMultipleEventsPerDay,
        "acceptsMultipleEventsPerDay",
      );
      const maxEventsPerDay = requiredInteger(
        data.maxEventsPerDay,
        "maxEventsPerDay",
        1,
        100,
      );
      if (!acceptsMultipleEventsPerDay && maxEventsPerDay !== 1) {
        throw new HttpsError(
          "invalid-argument",
          "maxEventsPerDay must be 1 unless multiple events are enabled.",
        );
      }
      const minGuestsPerEvent = requiredInteger(
        data.minGuestsPerEvent,
        "minGuestsPerEvent",
        0,
        100000,
      );

      const maxGuestsPerEvent = requiredInteger(
        data.maxGuestsPerEvent,
        "maxGuestsPerEvent",
        0,
        100000,
      );

      if (minGuestsPerEvent > maxGuestsPerEvent) {
        throw new HttpsError(
          "invalid-argument",
          "Minimum guests cannot exceed maximum guests.",
        );
      }
      return {
        minGuestsPerEvent,
        maxGuestsPerEvent,
        acceptsMultipleEventsPerDay,
        maxEventsPerDay,
        availableStaffCount: requiredInteger(
          data.availableStaffCount,
          "availableStaffCount",
          0,
          100000,
        ),
        availableEquipmentCount: requiredInteger(
          data.availableEquipmentCount,
          "availableEquipmentCount",
          0,
          100000,
        ),
        operatingDays: requiredEnumList(
          data.operatingDays,
          "operatingDays",
          PROVIDER_OPERATING_DAYS,
        ),
        bookingLeadTimeDays: requiredInteger(
          data.bookingLeadTimeDays,
          "bookingLeadTimeDays",
          0,
          365,
        ),
        unavailableDates: optionalIsoDateList(data.unavailableDates),
      };
    }
    case 6:
      rejectUnknownFields(data, [
        "acceptedTerms",
        "acceptedPrivacy",
        "termsPolicyVersion",
        "privacyPolicyVersion",
      ]);
      if (
        requireBoolean(data.acceptedTerms, "acceptedTerms") !== true ||
        requireBoolean(data.acceptedPrivacy, "acceptedPrivacy") !== true
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Terms and privacy consent are required.",
        );
      }
      return {
        termsPolicyVersion: requireString(
          data.termsPolicyVersion,
          "termsPolicyVersion",
          {minLength: 1, maxLength: 80},
        ),
        privacyPolicyVersion: requireString(
          data.privacyPolicyVersion,
          "privacyPolicyVersion",
          {minLength: 1, maxLength: 80},
        ),
      };
    default:
      throw new HttpsError("invalid-argument", "Unknown onboarding step.");
  }
}

function normalizeStepFiveCapacity(
  validated: Record<string, unknown>,
  existingDraft: Record<string, unknown>,
): Record<string, unknown> {
  const serviceCategories =
    Array.isArray(
      existingDraft.serviceCategories,
    )
      ? existingDraft.serviceCategories.filter(
          (
            value,
          ): value is ProviderServiceCategory =>
            typeof value === "string" &&
            PROVIDER_SERVICE_CATEGORIES.includes(
              value as ProviderServiceCategory,
            ),
        )
      : [];

  if (serviceCategories.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Complete service selection before configuring capacity.",
    );
  }

  const capabilities =
    providerCapacityCapabilities(
      serviceCategories,
    );

  const minGuestsPerEvent =
    requiredInteger(
      validated.minGuestsPerEvent,
      "minGuestsPerEvent",
      0,
      100000,
    );

  const maxGuestsPerEvent =
    requiredInteger(
      validated.maxGuestsPerEvent,
      "maxGuestsPerEvent",
      0,
      100000,
    );

  if (
    capabilities.requiresGuestCapacity &&
    (
      minGuestsPerEvent < 1 ||
      maxGuestsPerEvent < 1
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Guest capacity must be at least 1 for the selected services.",
    );
  }

  if (
    capabilities.requiresGuestCapacity &&
    minGuestsPerEvent >
      maxGuestsPerEvent
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Minimum guests cannot exceed maximum guests.",
    );
  }

  return {
    ...validated,

    minGuestsPerEvent:
      capabilities.requiresGuestCapacity
        ? minGuestsPerEvent
        : 0,

    maxGuestsPerEvent:
      capabilities.requiresGuestCapacity
        ? maxGuestsPerEvent
        : 0,

    availableStaffCount:
      capabilities.usesStaffCapacity
        ? validated.availableStaffCount
        : 0,

    availableEquipmentCount:
      capabilities.usesEquipmentCapacity
        ? validated.availableEquipmentCount
        : 0,
  };
}

function firstIncompleteStep(completed: ReadonlySet<number>): number {
  return SETUP_STEPS.find((step) => !completed.has(step)) ?? 7;
}

function requiredStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must contain between 1 and 50 values.`,
    );
  }
  return [...new Set(value.map((item, index) => requireString(
    item,
    `${field}[${index}]`,
    {minLength: 1, maxLength: 100},
  )))];
}

function requiredEnumList<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T[] {
  const values = requiredStringList(value, field);
  if (values.some((item) => !allowed.includes(item as T))) {
    throw new HttpsError(
      "invalid-argument",
      `${field} contains an unsupported value.`,
    );
  }
  return values as T[];
}

function optionalNumber(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number | null {
  if (value === undefined || value === null) return null;
  return requireNumber(value, field, {min: minimum, max: maximum});
}

function optionalIsoDateList(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 366) {
    throw new HttpsError(
      "invalid-argument",
      "unavailableDates must contain at most 366 dates.",
    );
  }
  const dates = value.map((item, index) =>
    requireString(item, `unavailableDates[${index}]`, {
      minLength: 10,
      maxLength: 10,
    })
  );
  if (dates.some((date) =>
    !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`))
  )) {
    throw new HttpsError(
      "invalid-argument",
      "unavailableDates must use YYYY-MM-DD.",
    );
  }
  return [...new Set(dates)].sort();
}

function requiredInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const result = requireNumber(value, field, {min: minimum, max: maximum});
  if (!Number.isInteger(result)) {
    throw new HttpsError("invalid-argument", `${field} must be an integer.`);
  }
  return result;
}

function optionalCoordinates(
  value: unknown,
): {latitude: number; longitude: number} | null {
  if (value === undefined || value === null) return null;
  const coordinates = requireObject(value, "locationCoordinates");
  rejectUnknownFields(coordinates, ["latitude", "longitude"]);
  return {
    latitude: requireNumber(coordinates.latitude, "latitude", {
      min: -90,
      max: 90,
    }),
    longitude: requireNumber(coordinates.longitude, "longitude", {
      min: -180,
      max: 180,
    }),
  };
}

function rejectUnknownFields(
  input: Record<string, unknown>,
  allowedFields: readonly string[],
): void {
  const unknown = Object.keys(input)
    .filter((field) => !allowedFields.includes(field));
  if (unknown.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      `Unknown onboarding fields: ${unknown.join(", ")}.`,
    );
  }
}

function providerMediaFields(
  data: Record<string, unknown>,
  ownerId: string,
): {
  logoUrl: string | null;
  logoPublicId: string | null;
  coverImageUrl: string | null;
  coverPublicId: string | null;
} {
  const logoUrl =
    optionalCloudinaryUrl(
      data.logoUrl,
      "logoUrl",
    );

  const logoPublicId =
    optionalCloudinaryPublicId(
      data.logoPublicId,
      ownerId,
      "logo",
    );

  const coverImageUrl =
    optionalCloudinaryUrl(
      data.coverImageUrl,
      "coverImageUrl",
    );

  const coverPublicId =
    optionalCloudinaryPublicId(
      data.coverPublicId,
      ownerId,
      "cover",
    );

  if (
    (logoUrl === null) !==
    (logoPublicId === null)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The logo URL and public ID must be provided together.",
    );
  }

  if (
    (coverImageUrl === null) !==
    (coverPublicId === null)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The cover URL and public ID must be provided together.",
    );
  }

  return {
    logoUrl,
    logoPublicId,
    coverImageUrl,
    coverPublicId,
  };
}

function optionalCloudinaryUrl(
  value: unknown,
  field: string,
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const result = requireString(
    value,
    field,
    {
      minLength: 20,
      maxLength: 1000,
    },
  );

  let url: URL;

  try {
    url = new URL(result);
  } catch {
    throw new HttpsError(
      "invalid-argument",
      `${field} is invalid.`,
    );
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !==
      "res.cloudinary.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} is invalid.`,
    );
  }

  return url.toString();
}

function optionalCloudinaryPublicId(
  value: unknown,
  ownerId: string,
  mediaType: "logo" | "cover",
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const field =
    `${mediaType}PublicId`;

  const result = requireString(
    value,
    field,
    {
      minLength: 10,
      maxLength: 500,
    },
  );

  const expected = [
    "feasta",
    "providers",
    ownerId,
    "onboarding",
    mediaType,
  ].join("/");

  if (result !== expected) {
    throw new HttpsError(
      "permission-denied",
      `${field} does not belong to this provider.`,
    );
  }

  return result;
}
