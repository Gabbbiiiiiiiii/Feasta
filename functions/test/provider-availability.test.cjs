const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");

const {
  AVAILABILITY_COUNTED_REQUEST_STATUSES,
  isCanonicalEventTimeRange,
  manilaDateFromKey,
  PROVIDER_PAYMENT_HOLD_WINDOW_MS,
  providerRequestOccupiesAvailability,
  validateProviderAvailability,
} = require(
  "../lib/provider-availability/validate-provider-availability.js",
);

test("parses canonical Manila dates and time ranges for every availability boundary", () => {
  assert.equal(
    manilaDateFromKey("2026-09-10").toISOString(),
    "2026-09-09T16:00:00.000Z",
  );
  assert.equal(manilaDateFromKey("2026-02-30"), null);
  assert.equal(isCanonicalEventTimeRange("18:00", "22:00"), true);
  assert.equal(isCanonicalEventTimeRange("22:00", "18:00"), false);
  assert.equal(isCanonicalEventTimeRange("6 PM", "22:00"), false);
});

const sourceRoot = join(__dirname, "../src");

function provider(overrides = {}) {
  return {
    ownerId: "owner_approved",
    verificationStatus: "approved",
    isActive: true,
    isSuspended: false,
    isDeleted: false,
    providerServiceType: "catering",
    providerCategory: "catering_service",
    serviceCategories: ["catering_service"],
    operatingDays: [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ],
    unavailableDates: [],
    bookingLeadTimeDays: 0,
    acceptsMultipleEventsPerDay: false,
    maxEventsPerDay: 1,
    minGuestsPerEvent: 10,
    maxGuestsPerEvent: 100,
    availableStaffCount: 5,
    availableEquipmentCount: 10,
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    providerRequestId: "request_candidate",
    type: "catering",
    eventDate: new Date("2026-08-24T04:00:00+08:00"),
    eventTime: "12:00",
    eventEndTime: "15:00",
    guestCount: 50,
    services: [],
    ...overrides,
  };
}

function validate(overrides = {}) {
  return validateProviderAvailability({
    providerData: overrides.providerData ?? provider(),
    request: overrides.request ?? request(),
    existingBookings: overrides.existingBookings ?? [],
    now: overrides.now ?? new Date("2026-08-20T12:00:00+08:00"),
  });
}

function codes(result) {
  return result.issues.map((issue) => issue.code);
}

test("uses Asia/Manila calendar days for operating-day checks", () => {
  const result = validate({
    providerData: provider({operatingDays: ["monday"]}),
    request: request({
      eventDate: new Date("2026-08-23T16:30:00.000Z"),
    }),
  });

  assert.equal(result.available, true);

  const rejected = validate({
    providerData: provider({operatingDays: ["tuesday"]}),
  });
  assert.ok(codes(rejected).includes("OUTSIDE_OPERATING_DAY"));
});

test("rejects canonical unavailable dates", () => {
  const result = validate({
    providerData: provider({unavailableDates: ["2026-08-24"]}),
  });

  assert.ok(codes(result).includes("BLOCKED_DATE"));
});

test("uses deterministic Manila calendar dates for lead time", () => {
  const result = validate({
    providerData: provider({bookingLeadTimeDays: 5}),
    now: new Date("2026-08-20T23:30:00+08:00"),
  });

  assert.ok(codes(result).includes("LEAD_TIME_NOT_MET"));
});

function overlappingBooking(overrides = {}) {
  return {
    providerRequestId: "request_existing",
    status: "confirmed",
    eventTime: "14:00",
    eventEndTime: "16:00",
    ...overrides,
  };
}

test("same-day non-overlapping HH:mm ranges do not conflict", () => {
  const result = validate({
    providerData: provider({
      acceptsMultipleEventsPerDay: false,
      maxEventsPerDay: 1,
      availableStaffCount: 0,
      availableEquipmentCount: 0,
    }),
    existingBookings: [{
      providerRequestId: "request_existing",
      status: "confirmed",
      eventTime: "16:00",
      eventEndTime: "18:00",
    }],
  });

  assert.equal(result.available, true);
  assert.equal(codes(result).includes("MAX_EVENTS_REACHED"), false);
  assert.equal(codes(result).includes("TIME_CONFLICT"), false);
});

test("occupancy follows status and the stored payment hold deadline", () => {
  const now = new Date("2026-08-20T12:00:00+08:00");
  const activeHold = new Date(now.getTime() + 60 * 60 * 1_000);
  const expiredHold = new Date(now.getTime() - 60 * 1_000);
  const recentAcceptance = new Date(
    now.getTime() - 60 * 60 * 1_000,
  );
  const staleAcceptance = new Date(
    now.getTime() - PROVIDER_PAYMENT_HOLD_WINDOW_MS - 1_000,
  );

  assert.equal(validate({
    now,
    existingBookings: [overlappingBooking({
      status: "pending",
      expiresAt: activeHold,
    })],
  }).available, true);

  assert.ok(codes(validate({
    now,
    existingBookings: [overlappingBooking({
      status: "waiting_for_down_payment",
      expiresAt: activeHold,
    })],
  })).includes("TIME_CONFLICT"));

  assert.equal(validate({
    now,
    existingBookings: [overlappingBooking({
      status: "waiting_for_down_payment",
      expiresAt: expiredHold,
      acceptedAt: recentAcceptance,
    })],
  }).available, true);

  assert.ok(codes(validate({
    now,
    existingBookings: [overlappingBooking({
      status: "payment_processing",
      expiresAt: activeHold,
    })],
  })).includes("TIME_CONFLICT"));

  assert.equal(validate({
    now,
    existingBookings: [overlappingBooking({
      status: "payment_processing",
      expiresAt: expiredHold,
    })],
  }).available, true);

  for (const status of ["confirmed", "in_progress"]) {
    assert.ok(codes(validate({
      now,
      existingBookings: [overlappingBooking({
        status,
        expiresAt: expiredHold,
      })],
    })).includes("TIME_CONFLICT"), status);
  }

  assert.equal(validate({
    now,
    request: request({
      eventDate: new Date("2026-09-24T04:00:00+08:00"),
    }),
    existingBookings: [overlappingBooking({status: "completed"})],
  }).available, true);

  for (const status of ["cancelled", "rejected", "expired", "completed"]) {
    assert.equal(providerRequestOccupiesAvailability({
      status,
      expiresAt: activeHold,
      now,
    }), false, status);
  }

  assert.equal(validate({
    now,
    existingBookings: [overlappingBooking({
      status: "accepted",
      acceptedAt: recentAcceptance,
    })],
  }).available, false);

  assert.equal(validate({
    now,
    existingBookings: [overlappingBooking({
      status: "accepted",
      acceptedAt: staleAcceptance,
    })],
  }).available, true);

  assert.equal(providerRequestOccupiesAvailability({
    status: "waiting_for_down_payment",
    expiresAt: {toMillis: () => activeHold.getTime()},
    now,
  }), true);
  assert.equal(providerRequestOccupiesAvailability({
    status: "waiting_for_down_payment",
    expiresAt: {toMillis: () => now.getTime()},
    now,
  }), false);
});

test("conflict authority ignores generic staff, equipment, and daily event caps", () => {
  const now = new Date("2026-08-20T12:00:00+08:00");
  const blocked = validate({
    now,
    providerData: provider({
      acceptsMultipleEventsPerDay: true,
      maxEventsPerDay: 50,
      availableStaffCount: 0,
      availableEquipmentCount: 0,
    }),
    existingBookings: [overlappingBooking({
      status: "confirmed",
    })],
  });
  const sameWithoutCapacity = validate({
    now,
    providerData: provider({
      acceptsMultipleEventsPerDay: false,
      maxEventsPerDay: 1,
      availableStaffCount: 9_999,
      availableEquipmentCount: 9_999,
    }),
    existingBookings: [overlappingBooking({
      status: "confirmed",
    })],
  });

  assert.deepEqual(codes(blocked), codes(sameWithoutCapacity));
  assert.deepEqual(codes(blocked), ["TIME_CONFLICT"]);

  const source = readFileSync(
    join(sourceRoot, "provider-availability/validate-provider-availability.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /maxEventsPerDay|acceptsMultipleEventsPerDay|availableStaffCount|availableEquipmentCount/u,
  );
  assert.deepEqual(AVAILABILITY_COUNTED_REQUEST_STATUSES, [
    "accepted",
    "waiting_for_down_payment",
    "payment_processing",
    "confirmed",
    "in_progress",
  ]);
});

test("guest capacity applies only to capability-requiring categories", () => {
  const catering = validate({
    request: request({guestCount: 101}),
  });
  assert.ok(codes(catering).includes("GUEST_CAPACITY_EXCEEDED"));

  const photographer = validate({
    providerData: provider({
      providerServiceType: "addon",
      providerCategory: "photographer",
      serviceCategories: ["photographer"],
      minGuestsPerEvent: 0,
      maxGuestsPerEvent: 0,
    }),
    request: request({
      type: "addon",
      guestCount: 5_000,
      services: [{category: "photographer"}],
    }),
  });
  assert.equal(
    codes(photographer).some((code) => code.startsWith("GUEST_CAPACITY")),
    false,
  );
  assert.equal(photographer.available, true);
});

test("rejects unsupported service capabilities and unapproved providers", () => {
  const unsupported = validate({
    request: request({type: "addon"}),
  });
  assert.ok(codes(unsupported).includes("SERVICE_CATEGORY_NOT_SUPPORTED"));

  const unapproved = validate({
    providerData: provider({
      verificationStatus: "under_review",
      isActive: false,
    }),
  });
  assert.ok(codes(unapproved).includes("PROVIDER_NOT_OPERATIONAL"));
});

test("detects authoritative HH:mm overlaps and rejects malformed time ranges", () => {
  const overlap = validate({
    existingBookings: [{
      providerRequestId: "request_existing",
      status: "confirmed",
      eventTime: "14:00",
      eventEndTime: "17:00",
    }],
  });
  assert.ok(codes(overlap).includes("TIME_CONFLICT"));

  const touching = validate({
    existingBookings: [{
      providerRequestId: "request_existing",
      status: "confirmed",
      eventTime: "15:00",
      eventEndTime: "18:00",
    }],
  });
  assert.equal(touching.available, true);

  const malformed = validate({
    request: request({eventTime: "noon", eventEndTime: ""}),
  });
  assert.ok(codes(malformed).includes("EVENT_TIME_INVALID"));
});

test("acceptance re-reads ownership and availability in one transaction", () => {
  const acceptance = readFileSync(
    join(sourceRoot, "provider-requests/accept-provider-request.ts"),
    "utf8",
  );

  assert.match(acceptance, /transaction\.get\(\s*providerRequestReference/u);
  assert.match(acceptance, /transaction\.get\(\s*activeRequestsQuery/u);
  assert.match(acceptance, /authorizeProviderRequest/u);
  assert.match(acceptance, /validateProviderAvailability/u);
  assert.match(acceptance, /AVAILABILITY_COUNTED_REQUEST_STATUSES/u);
  assert.match(acceptance, /PROVIDER_PAYMENT_HOLD_WINDOW_MS/u);
  assert.match(acceptance, /expiresAt:/u);
  assert.match(acceptance, /acceptedAt:/u);
  assert.match(acceptance, /"eventDate",\s*">="/u);
  assert.match(acceptance, /"eventDate",\s*"<"/u);
  assert.match(acceptance, /"failed-precondition",\s*"The provider is not available/u);
  const validationPosition =
    acceptance.lastIndexOf("validateProviderAvailability({");
  const updatePosition =
    acceptance.search(
      /transaction\.update\(\s*providerRequestReference/u,
    );
  assert.ok(validationPosition >= 0);
  assert.ok(updatePosition > validationPosition);
});

test("booking submission validates availability and remains a review flow", () => {
  const submission = readFileSync(
    join(sourceRoot, "bookings/submit-booking-request.ts"),
    "utf8",
  );

  assert.match(submission, /validateProviderAvailability/u);
  assert.match(submission, /AVAILABILITY_COUNTED_REQUEST_STATUSES/u);
  assert.match(submission, /expiresAt:/u);
  assert.match(submission, /acceptedAt:/u);

  for (const relativePath of [
    "provider-availability/check-customer-provider-availability.ts",
    "provider-availability/check-marketplace-provider-availability.ts",
  ]) {
    const checker = readFileSync(join(sourceRoot, relativePath), "utf8");
    assert.match(checker, /validateProviderAvailability/u);
    assert.match(checker, /AVAILABILITY_COUNTED_REQUEST_STATUSES/u);
    assert.match(checker, /expiresAt: document\.data\(\)\.expiresAt/u);
    assert.match(checker, /acceptedAt: document\.data\(\)\.acceptedAt/u);
  }
  assert.match(submission, /transaction\.get\(/u);
  assert.match(submission, /status:\s*"pending"/u);
  assert.match(submission, /"New Booking Request"/u);
});

test("availability setting mutations preserve provider ownership and trusted fields", () => {
  const mutation = readFileSync(
    join(sourceRoot, "providers/update-provider-availability.ts"),
    "utf8",
  );

  assert.match(mutation, /providerData\.ownerId !==\s*actor\.uid/u);
  assert.match(mutation, /isApprovedProviderForOperations/u);
  assert.match(mutation, /AVAILABILITY_SETTINGS_FIELDS/u);
  assert.match(mutation, /rejectUnknownFields/u);
  assert.match(mutation, /writeAuditLogInTransaction/u);
  assert.doesNotMatch(
    mutation,
    /AVAILABILITY_SETTINGS_FIELDS[\s\S]{0,300}verificationStatus/u,
  );
});
