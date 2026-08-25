const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");

const {
  AVAILABILITY_COUNTED_REQUEST_STATUSES,
  validateProviderAvailability,
} = require(
  "../lib/provider-availability/validate-provider-availability.js",
);

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

test("single-event and configured daily limits reject overbooking", () => {
  const existing = [{
    providerRequestId: "request_existing",
    status: "confirmed",
    eventTime: "16:00",
    eventEndTime: "18:00",
  }];
  const single = validate({existingBookings: existing});
  assert.ok(codes(single).includes("MAX_EVENTS_REACHED"));

  const multiple = validate({
    providerData: provider({
      acceptsMultipleEventsPerDay: true,
      maxEventsPerDay: 2,
    }),
    existingBookings: [
      ...existing,
      {
        providerRequestId: "request_existing_2",
        status: "waiting_for_down_payment",
        eventTime: "18:00",
        eventEndTime: "20:00",
      },
    ],
  });
  assert.ok(codes(multiple).includes("MAX_EVENTS_REACHED"));
});

test("counts only canonical active operational statuses", () => {
  assert.deepEqual(AVAILABILITY_COUNTED_REQUEST_STATUSES, [
    "accepted",
    "waiting_for_down_payment",
    "payment_processing",
    "confirmed",
    "in_progress",
  ]);

  for (const status of AVAILABILITY_COUNTED_REQUEST_STATUSES) {
    const result = validate({
      existingBookings: [{
        providerRequestId: `request_${status}`,
        status,
        eventTime: "16:00",
        eventEndTime: "18:00",
      }],
    });
    assert.ok(codes(result).includes("MAX_EVENTS_REACHED"), status);
  }

  const terminal = validate({
    existingBookings: ["rejected", "cancelled", "expired"].map(
      (status) => ({
        providerRequestId: `request_${status}`,
        status,
        eventTime: "12:00",
        eventEndTime: "15:00",
      }),
    ),
  });
  assert.equal(terminal.available, true);
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
    providerData: provider({
      acceptsMultipleEventsPerDay: true,
      maxEventsPerDay: 3,
    }),
    existingBookings: [{
      providerRequestId: "request_existing",
      status: "confirmed",
      eventTime: "14:00",
      eventEndTime: "17:00",
    }],
  });
  assert.ok(codes(overlap).includes("TIME_CONFLICT"));

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
