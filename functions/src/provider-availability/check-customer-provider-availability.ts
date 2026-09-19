import {Timestamp} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {validateBookingPackage} from "../bookings/booking-contract.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  isProviderPubliclyEligible,
  PROVIDER_SERVICE_CATEGORIES,
  USER_ROLES,
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
  AVAILABILITY_COUNTED_REQUEST_STATUSES,
  isCanonicalEventTimeRange,
  manilaDateFromKey,
  manilaDateRange,
  validateProviderAvailability,
  type ProviderAvailabilityIssueCode,
  type ProviderAvailabilityResult,
} from "./validate-provider-availability.js";

const MAX_ADDON_IDS = 20;
const INPUT_FIELDS = [
  "packageId",
  "addonIds",
  "eventDate",
  "eventTime",
  "eventEndTime",
  "guestCount",
] as const;
const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{8,160}$/u;

type CustomerAvailabilityInput = {
  packageId: string;
  addonIds: string[];
  eventDate: Date;
  eventTime: string;
  eventEndTime: string;
  guestCount: number;
};

type ResolvedAddon = {
  addonId: string;
  providerId: string;
  ownerId: string;
  category: string;
};

type AvailabilityCandidate = {
  providerId: string;
  type: "catering" | "addon";
  services: Array<{
    serviceId: string;
    category: string;
  }>;
  providerData: Readonly<Record<string, unknown>>;
  publiclyEligible: boolean;
};

export type CustomerProviderAvailabilityResult = {
  providerId: string;
  available: boolean;
  reasonCode: ProviderAvailabilityIssueCode | null;
  message: string;
};

export const checkCustomerProviderAvailability = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);

    await requireRole(actor.uid, [
      USER_ROLES.customer,
    ]);

    await enforceCallableRateLimit(request, {
      scope: "providerAvailability.customerCheck",
      limit: 30,
      windowSeconds: 10 * 60,
    });

    const input = parseCustomerAvailabilityInput(request.data);
    return checkCustomerProviderAvailabilityForInput(input);
  },
);

export async function checkCustomerProviderAvailabilityForInput(
  input: CustomerAvailabilityInput,
  now = new Date(),
): Promise<{results: CustomerProviderAvailabilityResult[]}> {
  const packageReference = db
    .collection("packages")
    .doc(input.packageId);
  const addonReferences = input.addonIds.map((addonId) =>
    db.collection("addons").doc(addonId)
  );
  const [packageSnapshot, ...addonSnapshots] = await db.getAll(
    packageReference,
    ...addonReferences,
  );

  if (!packageSnapshot.exists) {
    throw bookingConditionsChanged();
  }

  const packageData = packageSnapshot.data() ?? {};
  const cateringProviderId = storedDocumentId(packageData.providerId);

  if (!cateringProviderId) {
    throw bookingConditionsChanged();
  }

  const packageValidation = validateBookingPackage({
    packageData,
    expectedProviderId: cateringProviderId,
    submittedEventType: stringValue(packageData.eventType),
    guestCount: input.guestCount,
  });

  if (!packageValidation.valid) {
    throw bookingConditionsChanged();
  }

  const addons = addonSnapshots.map((snapshot): ResolvedAddon => {
    if (!snapshot.exists) {
      throw bookingConditionsChanged();
    }

    const data = snapshot.data() ?? {};
    const providerId = storedDocumentId(data.providerId);
    const ownerId = storedDocumentId(data.ownerId);
    const category = stringValue(data.category);

    if (
      !providerId ||
      !ownerId ||
      !PROVIDER_SERVICE_CATEGORIES.includes(
        category as (typeof PROVIDER_SERVICE_CATEGORIES)[number],
      ) ||
      data.isActive !== true ||
      data.isAvailable !== true ||
      data.isPublished !== true ||
      data.status !== "published" ||
      data.isDeleted === true
    ) {
      throw bookingConditionsChanged();
    }

    return {
      addonId: snapshot.id,
      providerId,
      ownerId,
      category,
    };
  });

  const providerIds = [
    cateringProviderId,
    ...new Set(addons.map((addon) => addon.providerId)),
  ].filter((providerId, index, values) =>
    values.indexOf(providerId) === index
  );
  const providerSnapshots = await db.getAll(
    ...providerIds.map((providerId) =>
      db.collection("providers").doc(providerId)
    ),
  );
  const providers = new Map(
    providerSnapshots.map((snapshot) => {
      if (!snapshot.exists) {
        throw bookingConditionsChanged();
      }

      return [snapshot.id, snapshot.data() ?? {}] as const;
    }),
  );
  const ownerIds = [
    ...new Set(providerSnapshots.map((snapshot) => {
      const ownerId = storedDocumentId(snapshot.data()?.ownerId);

      if (!ownerId) {
        throw bookingConditionsChanged();
      }

      return ownerId;
    })),
  ];
  const ownerSnapshots = await db.getAll(
    ...ownerIds.map((ownerId) =>
      db.collection("users").doc(ownerId)
    ),
  );
  const owners = new Map(
    ownerSnapshots.map((snapshot) => [
      snapshot.id,
      snapshot.exists ? snapshot.data() ?? {} : {},
    ]),
  );

  for (const addon of addons) {
    const provider = providers.get(addon.providerId) ?? {};

    if (provider.ownerId !== addon.ownerId) {
      throw bookingConditionsChanged();
    }
  }

  const candidates = buildCandidates({
    cateringProviderId,
    addons,
    providers,
    owners,
  });
  const eventDateRange = manilaDateRange(input.eventDate);

  if (!eventDateRange) {
    throw new HttpsError(
      "invalid-argument",
      "The event date is invalid.",
    );
  }

  const bookingSnapshots = await Promise.all(
    candidates.map((candidate) =>
      db.collection("providerRequests")
        .where("providerId", "==", candidate.providerId)
        .where(
          "eventDate",
          ">=",
          Timestamp.fromDate(eventDateRange.start),
        )
        .where(
          "eventDate",
          "<",
          Timestamp.fromDate(eventDateRange.end),
        )
        .where(
          "status",
          "in",
          [...AVAILABILITY_COUNTED_REQUEST_STATUSES],
        )
        .get()
    ),
  );

  return {
    results: candidates.map((candidate, index) => {
      if (!candidate.publiclyEligible) {
        return customerSafeUnavailableResult(
          candidate.providerId,
          "PROVIDER_NOT_OPERATIONAL",
          candidate.providerData,
        );
      }

      const bookingSnapshot = bookingSnapshots[index];

      if (!bookingSnapshot) {
        return customerSafeUnavailableResult(
          candidate.providerId,
          "PROVIDER_SCHEDULE_INVALID",
          candidate.providerData,
        );
      }

      const availability = validateProviderAvailability({
        providerData: candidate.providerData,
        request: {
          providerRequestId: `customer_precheck_${candidate.providerId}`,
          type: candidate.type,
          eventDate: input.eventDate,
          eventTime: input.eventTime,
          eventEndTime: input.eventEndTime,
          guestCount: input.guestCount,
          services: candidate.services,
        },
        existingBookings: bookingSnapshot.docs.map((document) => ({
          providerRequestId: document.id,
          status: document.data().status,
          eventTime: document.data().eventTime,
          eventEndTime: document.data().eventEndTime,
        })),
        now,
      });

      return customerSafeAvailabilityResult(
        candidate.providerId,
        availability,
        candidate.providerData,
      );
    }),
  };
}

export function customerSafeAvailabilityResult(
  providerId: string,
  availability: ProviderAvailabilityResult,
  providerData: Readonly<Record<string, unknown>>,
): CustomerProviderAvailabilityResult {
  if (availability.available) {
    return {
      providerId,
      available: true,
      reasonCode: null,
      message: "Available for your selected event.",
    };
  }

  const issue = availability.issues[0];

  return customerSafeUnavailableResult(
    providerId,
    issue?.code ?? "PROVIDER_SCHEDULE_INVALID",
    providerData,
  );
}

function customerSafeUnavailableResult(
  providerId: string,
  reasonCode: ProviderAvailabilityIssueCode,
  providerData: Readonly<Record<string, unknown>>,
): CustomerProviderAvailabilityResult {
  return {
    providerId,
    available: false,
    reasonCode,
    message: customerSafeAvailabilityMessage(reasonCode, providerData),
  };
}

export function customerSafeAvailabilityMessage(
  reasonCode: ProviderAvailabilityIssueCode,
  providerData: Readonly<Record<string, unknown>>,
): string {
  switch (reasonCode) {
  case "LEAD_TIME_NOT_MET": {
    const days = providerData.bookingLeadTimeDays;

    return Number.isInteger(days) && (days as number) >= 0
      ? `Requires booking at least ${days} ${(days as number) === 1 ? "day" : "days"} in advance.`
      : "The provider's booking lead time is not met.";
  }
  case "OUTSIDE_OPERATING_DAY":
  case "BLOCKED_DATE":
    return "Not available on this date.";
  case "MAX_EVENTS_REACHED":
    return "Already fully booked for this date.";
  case "TIME_CONFLICT":
    return "Not available during the selected time.";
  case "GUEST_CAPACITY_BELOW_MINIMUM":
    return "The guest count is below this provider's supported range.";
  case "GUEST_CAPACITY_EXCEEDED":
    return "Guest count exceeds this provider's supported capacity.";
  case "SERVICE_CATEGORY_NOT_SUPPORTED":
    return "This provider does not support the selected service.";
  case "EVENT_DATE_INVALID":
    return "Choose a valid event date.";
  case "EVENT_TIME_INVALID":
    return "Choose a valid event time range.";
  case "PROVIDER_NOT_OPERATIONAL":
  case "PROVIDER_SCHEDULE_INVALID":
    return "Provider unavailable for this event.";
  }
}

function buildCandidates(input: {
  cateringProviderId: string;
  addons: ResolvedAddon[];
  providers: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  owners: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}): AvailabilityCandidate[] {
  const addonsByProvider = new Map<string, ResolvedAddon[]>();

  for (const addon of input.addons) {
    if (addon.providerId === input.cateringProviderId) continue;

    const current = addonsByProvider.get(addon.providerId) ?? [];
    current.push(addon);
    addonsByProvider.set(addon.providerId, current);
  }

  return [
    candidate(input.cateringProviderId, "catering", [], input),
    ...[...addonsByProvider.entries()].map(([providerId, addons]) =>
      candidate(
        providerId,
        "addon",
        addons.map((addon) => ({
          serviceId: addon.addonId,
          category: addon.category,
        })),
        input,
      )
    ),
  ];
}

function candidate(
  providerId: string,
  type: "catering" | "addon",
  services: AvailabilityCandidate["services"],
  relations: {
    providers: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
    owners: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  },
): AvailabilityCandidate {
  const providerData = relations.providers.get(providerId) ?? {};
  const ownerId = storedDocumentId(providerData.ownerId);
  const owner = ownerId ? relations.owners.get(ownerId) ?? {} : {};

  return {
    providerId,
    type,
    services,
    providerData,
    publiclyEligible: isProviderPubliclyEligible(
      {...providerData, id: providerId},
      owner,
    ),
  };
}

export function parseCustomerAvailabilityInput(
  value: unknown,
): CustomerAvailabilityInput {
  const input = requireObject(value);
  rejectUnknownFields(input);

  const packageId = customerDocumentId(input.packageId, "packageId");
  const addonIds = customerDocumentIdList(input.addonIds, "addonIds");
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

  if (!eventDate) {
    throw new HttpsError("invalid-argument", "eventDate is invalid.");
  }

  if (!isCanonicalEventTimeRange(eventTime, eventEndTime)) {
    throw new HttpsError(
      "invalid-argument",
      "The event time range is invalid.",
    );
  }

  if (!Number.isSafeInteger(guestCount)) {
    throw new HttpsError("invalid-argument", "guestCount is invalid.");
  }

  return {
    packageId,
    addonIds,
    eventDate,
    eventTime,
    eventEndTime,
    guestCount,
  };
}

function customerDocumentId(value: unknown, field: string): string {
  const id = requireString(value, field, {
    minLength: 8,
    maxLength: 160,
  });

  if (!SAFE_DOCUMENT_ID.test(id)) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }

  return id;
}

function customerDocumentIdList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length > MAX_ADDON_IDS) {
    throw new HttpsError("invalid-argument", `${field} is invalid.`);
  }

  return [...new Set(value.map((item) =>
    customerDocumentId(item, field)
  ))];
}

function rejectUnknownFields(input: Record<string, unknown>): void {
  if (Object.keys(input).some((field) =>
    !INPUT_FIELDS.includes(field as (typeof INPUT_FIELDS)[number])
  )) {
    throw new HttpsError(
      "invalid-argument",
      "The availability request contains unsupported fields.",
    );
  }
}

function storedDocumentId(value: unknown): string | null {
  return typeof value === "string" && SAFE_DOCUMENT_ID.test(value.trim())
    ? value.trim()
    : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function bookingConditionsChanged(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "Booking options changed. Refresh the page and try again.",
  );
}
