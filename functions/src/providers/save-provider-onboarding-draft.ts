import {HttpsError, onCall} from "firebase-functions/v2/https";
import {getStorage} from "firebase-admin/storage";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  PROVIDER_EVENT_TYPES,
  PROVIDER_OPERATING_DAYS,
  PROVIDER_SERVICE_CATEGORIES,
  PROVIDER_SERVICE_TYPES,
  USER_ROLES,
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
  requireString,
} from "../shared/validation.js";

const SETUP_STEPS = [1, 2, 3, 4, 5, 6] as const;

export const saveProviderOnboardingDraft = onCall(
  appCheckCallableOptions,
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
    const validated = validateStep(step, data, actor.uid);
    if (step === 2) {
      await Promise.all([
        verifyProviderMedia(
          validated.logoStoragePath,
          "logo",
          5 * 1024 * 1024,
        ),
        verifyProviderMedia(
          validated.coverStoragePath,
          "cover",
          10 * 1024 * 1024,
        ),
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
        ownerPhone: requirePhilippinePhone(data.ownerPhone, "ownerPhone"),
      };
    case 2: {
      rejectUnknownFields(data, [
        "businessName",
        "businessEmail",
        "businessPhone",
        "description",
        "logoStoragePath",
        "coverStoragePath",
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
        logoStoragePath: optionalProviderMediaPath(
          data.logoStoragePath,
          ownerId,
          "logo",
        ),
        coverStoragePath: optionalProviderMediaPath(
          data.coverStoragePath,
          ownerId,
          "cover",
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
        1,
        100000,
      );
      const maxGuestsPerEvent = requiredInteger(
          data.maxGuestsPerEvent,
          "maxGuestsPerEvent",
          1,
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

function requirePhilippinePhone(value: unknown, field: string): string {
  const compact = requireString(value, field, {
    minLength: 7,
    maxLength: 30,
  }).replace(/[\s().-]/gu, "");
  const normalized = compact.startsWith("+63")
    ? compact
    : compact.startsWith("63")
      ? `+${compact}`
      : compact.startsWith("0")
        ? `+63${compact.slice(1)}`
        : "";
  if (!/^\+63\d{8,10}$/u.test(normalized)) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be a valid Philippine phone number.`,
    );
  }
  return normalized;
}

function optionalProviderMediaPath(
  value: unknown,
  ownerId: string,
  mediaType: "logo" | "cover",
): string | null {
  if (value === undefined || value === null) return null;
  const path = requireString(value, `${mediaType}StoragePath`, {
    minLength: 10,
    maxLength: 500,
  });
  const prefix = `providers/${ownerId}/${mediaType}/`;
  const fileName = path.startsWith(prefix) ? path.slice(prefix.length) : "";
  if (
    fileName.length === 0 ||
    fileName.includes("/") ||
    !/\.(?:jpe?g|png|webp)$/iu.test(fileName)
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${mediaType}StoragePath is invalid.`,
    );
  }
  return path;
}

async function verifyProviderMedia(
  value: unknown,
  mediaType: "logo" | "cover",
  maximumBytes: number,
): Promise<void> {
  if (value === null) return;
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      `${mediaType}StoragePath is invalid.`,
    );
  }
  const file = getStorage().bucket().file(value);
  const [exists] = await file.exists();
  if (!exists) {
    throw new HttpsError(
      "failed-precondition",
      `The uploaded business ${mediaType} was not found.`,
    );
  }
  const [metadata] = await file.getMetadata();
  const contentType = metadata.contentType ?? "";
  const size = Number(metadata.size ?? 0);
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
    throw new HttpsError(
      "failed-precondition",
      `The uploaded business ${mediaType} type is not allowed.`,
    );
  }
  if (!Number.isFinite(size) || size <= 0 || size > maximumBytes) {
    throw new HttpsError(
      "failed-precondition",
      `The uploaded business ${mediaType} size is invalid.`,
    );
  }
}
