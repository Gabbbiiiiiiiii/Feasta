import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  isProviderPubliclyEligible,
  parseProviderServiceType,
  PROVIDER_SERVICE_CATEGORIES,
  PROVIDER_SERVICE_TYPES,
  USER_ROLES,
  type ProviderServiceCategory,
} from "../shared/constants.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {db} from "../shared/firestore.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {
  requireNumber,
  requireObject,
  requireString,
} from "../shared/validation.js";
import {
  customerSafeAvailabilityResult,
  type CustomerProviderAvailabilityResult,
} from "./check-customer-provider-availability.js";
import {
  AVAILABILITY_COUNTED_REQUEST_STATUSES,
  isCanonicalEventTimeRange,
  manilaDateFromKey,
  manilaDateRange,
  validateProviderAvailability,
} from "./validate-provider-availability.js";

const MAX_PROVIDER_IDS = 12;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{8,160}$/u;
const INPUT_FIELDS = [
  "providerIds",
  "eventDate",
  "eventTime",
  "eventEndTime",
  "guestCount",
  "serviceType",
] as const;

type MarketplaceAvailabilityInput = {
  providerIds: string[];
  eventDate: Date;
  eventTime: string;
  eventEndTime: string;
  guestCount: number;
  serviceType: "all" | "catering" | "addon" | "both";
};

export const checkMarketplaceProviderAvailability = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.customer]);
    await enforceCallableRateLimit(request, {
      scope: "providerAvailability.marketplaceCheck",
      limit: 30,
      windowSeconds: 10 * 60,
    });

    return checkMarketplaceProviderAvailabilityForInput(
      parseMarketplaceAvailabilityInput(request.data),
    );
  },
);

export async function checkMarketplaceProviderAvailabilityForInput(
  input: MarketplaceAvailabilityInput,
  now = new Date(),
): Promise<{results: CustomerProviderAvailabilityResult[]}> {
  const providerSnapshots = await db.getAll(
    ...input.providerIds.map((providerId) =>
      db.collection("providers").doc(providerId)
    ),
  );
  const ownerIds = [...new Set(providerSnapshots.flatMap((snapshot) => {
    const ownerId = storedDocumentId(snapshot.data()?.ownerId);
    return ownerId ? [ownerId] : [];
  }))];
  const ownerSnapshots = ownerIds.length > 0
    ? await db.getAll(...ownerIds.map((ownerId) =>
      db.collection("users").doc(ownerId)
    ))
    : [];
  const owners = new Map(ownerSnapshots.map((snapshot) => [
    snapshot.id,
    snapshot.exists ? snapshot.data() ?? {} : {},
  ]));
  const eventDateRange = manilaDateRange(input.eventDate);

  if (!eventDateRange) {
    throw new HttpsError("invalid-argument", "The event date is invalid.");
  }

  const bookingSnapshots = await Promise.all(providerSnapshots.map((snapshot) =>
    db.collection("providerRequests")
      .where("providerId", "==", snapshot.id)
      .where("eventDate", ">=", Timestamp.fromDate(eventDateRange.start))
      .where("eventDate", "<", Timestamp.fromDate(eventDateRange.end))
      .where("status", "in", [...AVAILABILITY_COUNTED_REQUEST_STATUSES])
      .get()
  ));

  return {
    results: providerSnapshots.map((snapshot, index) => {
      const providerData = snapshot.exists ? snapshot.data() ?? {} : {};
      const ownerId = storedDocumentId(providerData.ownerId);
      const owner = ownerId ? owners.get(ownerId) ?? {} : {};
      const publiclyEligible = snapshot.exists && isProviderPubliclyEligible(
        {...providerData, id: snapshot.id},
        owner,
      );

      if (!publiclyEligible) {
        return customerSafeAvailabilityResult(snapshot.id, {
          available: false,
          issues: [{
            code: "PROVIDER_NOT_OPERATIONAL",
            field: "providerId",
            message: "The provider is not operational.",
          }],
        }, providerData);
      }

      const providerType = parseProviderServiceType(
        providerData.providerServiceType,
      );
      const requestType = providerType === "addon" ||
        (providerType === "both" && input.serviceType === "addon")
        ? "addon"
        : "catering";
      const categories = authoritativeCategories(providerData);
      const services = requestType === "addon"
        ? categories.map((category, categoryIndex) => ({
            serviceId: `marketplace_${snapshot.id}_${categoryIndex}`,
            category,
          }))
        : [];
      const bookings = bookingSnapshots[index];
      const availability = validateProviderAvailability({
        providerData,
        request: {
          providerRequestId: `marketplace_precheck_${snapshot.id}`,
          type: requestType,
          eventDate: input.eventDate,
          eventTime: input.eventTime,
          eventEndTime: input.eventEndTime,
          guestCount: input.guestCount,
          services,
        },
        existingBookings: bookings?.docs.map((document) => ({
          providerRequestId: document.id,
          status: document.data().status,
          eventTime: document.data().eventTime,
          eventEndTime: document.data().eventEndTime,
        })) ?? [],
        now,
      });

      return customerSafeAvailabilityResult(
        snapshot.id,
        availability,
        providerData,
      );
    }),
  };
}

export function parseMarketplaceAvailabilityInput(
  value: unknown,
): MarketplaceAvailabilityInput {
  const input = requireObject(value);
  rejectUnknownFields(input);
  const providerIds = documentIdList(input.providerIds);
  const eventDateKey = requireString(input.eventDate, "eventDate", {
    minLength: 10,
    maxLength: 10,
  });
  const eventDate = manilaDateFromKey(eventDateKey);
  const eventTime = requireString(input.eventTime, "eventTime", {
    minLength: 5,
    maxLength: 5,
  });
  const eventEndTime = requireString(input.eventEndTime, "eventEndTime", {
    minLength: 5,
    maxLength: 5,
  });
  const guestCount = requireNumber(input.guestCount, "guestCount", {
    min: 1,
    max: 10_000,
  });
  const serviceType = requireString(input.serviceType, "serviceType", {
    minLength: 3,
    maxLength: 10,
  });

  if (!eventDate || !isCanonicalEventTimeRange(eventTime, eventEndTime)) {
    throw new HttpsError("invalid-argument", "The event date or time is invalid.");
  }
  if (!Number.isSafeInteger(guestCount)) {
    throw new HttpsError("invalid-argument", "guestCount is invalid.");
  }
  if (serviceType !== "all" &&
    !PROVIDER_SERVICE_TYPES.includes(
      serviceType as (typeof PROVIDER_SERVICE_TYPES)[number],
    )) {
    throw new HttpsError("invalid-argument", "serviceType is invalid.");
  }

  return {
    providerIds,
    eventDate,
    eventTime,
    eventEndTime,
    guestCount,
    serviceType: serviceType as MarketplaceAvailabilityInput["serviceType"],
  };
}

function documentIdList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PROVIDER_IDS) {
    throw new HttpsError("invalid-argument", "providerIds is invalid.");
  }
  const providerIds = [...new Set(value.map((item) => {
    if (typeof item !== "string" || !SAFE_DOCUMENT_ID.test(item.trim())) {
      throw new HttpsError("invalid-argument", "providerIds is invalid.");
    }
    return item.trim();
  }))];
  if (providerIds.length !== value.length) {
    throw new HttpsError("invalid-argument", "providerIds is invalid.");
  }
  return providerIds;
}

function authoritativeCategories(
  providerData: Readonly<Record<string, unknown>>,
): ProviderServiceCategory[] {
  const values = Array.isArray(providerData.serviceCategories)
    ? providerData.serviceCategories
    : [providerData.providerCategory];
  return [...new Set(values.filter(
    (category): category is ProviderServiceCategory =>
      typeof category === "string" &&
      PROVIDER_SERVICE_CATEGORIES.includes(category as ProviderServiceCategory),
  ))];
}

function rejectUnknownFields(input: Record<string, unknown>): void {
  if (Object.keys(input).some((field) =>
    !INPUT_FIELDS.includes(field as (typeof INPUT_FIELDS)[number])
  )) {
    throw new HttpsError(
      "invalid-argument",
      "The marketplace availability request contains unsupported fields.",
    );
  }
}

function storedDocumentId(value: unknown): string | null {
  return typeof value === "string" && SAFE_DOCUMENT_ID.test(value.trim())
    ? value.trim()
    : null;
}
