const assert = require("node:assert/strict");
const test = require("node:test");
const {Timestamp} = require("firebase-admin/firestore");

const {
  assertCanonicalProviderRequestCore,
  requireProviderResponseParentStatus,
  validateAcceptanceProviderRequest,
} = require(
  "../lib/provider-requests/provider-request-integrity.js",
);

const EVENT_ID = "event_integrity_001";
const REQUEST_ID = "request_integrity_001";
const CUSTOMER_ID = "customer_integrity_001";
const PROVIDER_ID = "provider_photography_001";
const EVENT_DATE = Timestamp.fromDate(
  new Date("2027-06-18T00:00:00+08:00"),
);

function mainEvent(overrides = {}) {
  return {
    bookingId: EVENT_ID,
    mainEventId: EVENT_ID,
    customerId: CUSTOMER_ID,
    status: "pending_provider_approval",
    providerRequestIds: [REQUEST_ID],
    eventDate: EVENT_DATE,
    eventTime: "10:00",
    eventEndTime: "14:00",
    eventType: "Wedding",
    guestCount: 100,
    eventLocation: "Ormoc City",
    eventAddress: "123 Trusted Street",
    selectedAddOns: [{
      addonId: "service_photography_001",
      providerId: PROVIDER_ID,
      ownerId: "owner_photography_001",
      name: "Wedding Photography",
      category: "photographer",
      price: 12000,
      downPaymentPercentage: 25,
      source: "marketplace",
    }],
    ...overrides,
  };
}

function requestData(overrides = {}) {
  return {
    providerRequestId: REQUEST_ID,
    bookingId: EVENT_ID,
    mainEventId: EVENT_ID,
    customerId: CUSTOMER_ID,
    providerId: PROVIDER_ID,
    type: "addon",
    status: "pending",
    eventDate: EVENT_DATE,
    eventTime: "10:00",
    eventEndTime: "14:00",
    eventType: "Wedding",
    guestCount: 100,
    eventLocation: "Ormoc City",
    eventAddress: "123 Trusted Street",
    packageId: null,
    packageName: null,
    services: [{
      serviceId: "service_photography_001",
      name: "Wedding Photography",
      category: "photographer",
      price: 12000,
      downPaymentPercentage: 25,
      downPaymentAmount: 3000,
    }],
    amount: 12000,
    downPaymentPercentage: 25,
    downPaymentAmount: 3000,
    remainingBalance: 9000,
    ...overrides,
  };
}

function authorized(overrides = {}) {
  const data = requestData(overrides.requestData);
  return {
    providerRequestId: REQUEST_ID,
    mainEventId: EVENT_ID,
    customerId: CUSTOMER_ID,
    providerId: PROVIDER_ID,
    type: "addon",
    status: "pending",
    requestData: data,
    providerData: {},
    ...overrides,
    requestData: data,
  };
}

function snapshot(data, overrides = {}) {
  return {
    exists: true,
    id: EVENT_ID,
    data: () => data,
    ...overrides,
  };
}

function core(event = mainEvent(), actor = authorized()) {
  return assertCanonicalProviderRequestCore({
    authorized: actor,
    mainEventSnapshot: snapshot(event),
  });
}

function validate(event = mainEvent(), actor = authorized(), now) {
  return validateAcceptanceProviderRequest({
    authorized: actor,
    mainEventData: event,
    now: now ?? new Date("2027-06-17T12:00:00+08:00"),
  });
}

test("core integrity proves request identity, ownership, customer, and parent membership", () => {
  assert.equal(core().mainEventStatus, "pending_provider_approval");

  const cases = [
    [mainEvent({providerRequestIds: ["request_other_001"]}), authorized()],
    [mainEvent({customerId: "customer_other_001"}), authorized()],
    [mainEvent(), authorized({requestData: {bookingId: "event_other_001"}})],
    [mainEvent(), authorized({requestData: {mainEventId: "event_other_001"}})],
    [mainEvent(), authorized({requestData: {providerRequestId: "request_other_001"}})],
    [mainEvent(), authorized({requestData: {providerId: "provider_other_001"}})],
  ];

  for (const [event, actor] of cases) {
    assert.throws(() => core(event, actor), /linkage is invalid/u);
  }
});

test("new responses require only the two canonical parent response states", () => {
  assert.doesNotThrow(() =>
    requireProviderResponseParentStatus("pending_provider_approval"));
  assert.doesNotThrow(() =>
    requireProviderResponseParentStatus("needs_provider_replacement"));

  for (const status of [
    "draft",
    "waiting_for_down_payment",
    "confirmed",
    "in_progress",
    "completed",
    "cancelled",
    "expired",
  ]) {
    assert.throws(
      () => requireProviderResponseParentStatus(status),
      /cannot receive a new provider response/u,
      status,
    );
  }
});

test("acceptance supports a non-catering-only independent service request", () => {
  const result = validate();

  assert.equal(result.amount, 12000);
  assert.equal(result.downPaymentAmount, 3000);
  assert.equal(result.remainingBalance, 9000);
});

test("acceptance preserves provider-owned add-ons in the owning package request", () => {
  const packageId = "package_catering_001";
  const addonId = "service_extra_staff_001";
  const providerId = "provider_catering_001";
  const event = mainEvent({
    providerId,
    currentProviderId: providerId,
    packageId,
    packageName: "Celebration Package",
    packagePrice: 10000,
    totalAmount: 12000,
    downPaymentPercentage: 20.83,
    downPaymentAmount: 2500,
    remainingBalance: 9500,
    selectedAddOns: [{
      addonId,
      providerId,
      ownerId: "owner_catering_001",
      name: "Additional Staff",
      category: "catering_service",
      price: 2000,
      downPaymentPercentage: 25,
      source: "provider",
    }],
  });
  const actor = authorized({
    providerId,
    type: "catering",
    requestData: {
      providerId,
      type: "catering",
      packageId,
      packageName: "Celebration Package",
      services: [
        {
          serviceId: packageId,
          name: "Celebration Package",
          category: "catering",
          price: 10000,
          downPaymentPercentage: 20,
          downPaymentAmount: 2000,
        },
        {
          serviceId: addonId,
          name: "Additional Staff",
          category: "catering_service",
          price: 2000,
          downPaymentPercentage: 25,
          downPaymentAmount: 500,
        },
      ],
      amount: 12000,
      downPaymentPercentage: 20.83,
      downPaymentAmount: 2500,
      remainingBalance: 9500,
    },
  });

  assert.equal(validate(event, actor).amount, 12000);
});

test("independent provider validation ignores selections owned by other providers", () => {
  const event = mainEvent({
    selectedAddOns: [
      ...mainEvent().selectedAddOns,
      {
        addonId: "service_styling_001",
        providerId: "provider_styling_001",
        ownerId: "owner_styling_001",
        name: "Event Styling",
        category: "event_stylist",
        price: 15000,
        downPaymentPercentage: 20,
        source: "marketplace",
      },
    ],
  });

  assert.equal(validate(event).amount, 12000);
});

test("acceptance rejects event snapshot mismatches", () => {
  const cases = [
    ["eventDate", Timestamp.fromDate(new Date("2027-06-19T00:00:00+08:00"))],
    ["eventTime", "11:00"],
    ["eventEndTime", "15:00"],
    ["eventType", "Birthday"],
    ["guestCount", 99],
    ["eventLocation", "Tacloban City"],
    ["eventAddress", "Different Street"],
  ];

  for (const [field, value] of cases) {
    const actor = authorized({requestData: {[field]: value}});
    assert.throws(() => validate(mainEvent(), actor), /does not match/u, field);
  }
});

test("acceptance rejects service/provider linkage and financial tampering", () => {
  assert.throws(
    () => validate(mainEvent(), authorized({
      requestData: {type: "catering"},
    })),
    /service linkage is invalid/u,
  );

  assert.throws(
    () => validate(mainEvent(), authorized({
      requestData: {
        services: [{
          ...requestData().services[0],
          serviceId: "service_unselected_001",
        }],
      },
    })),
    /service linkage is invalid/u,
  );

  assert.throws(
    () => validate(mainEvent(), authorized({
      requestData: {amount: 1},
    })),
    /financial snapshot is invalid/u,
  );
});

test("acceptance rejects at or after the authoritative Manila event start", () => {
  assert.doesNotThrow(() => validate(
    mainEvent(),
    authorized(),
    new Date("2027-06-18T09:59:59+08:00"),
  ));
  assert.throws(
    () => validate(
      mainEvent(),
      authorized(),
      new Date("2027-06-18T10:00:00+08:00"),
    ),
    /event has started/u,
  );
});

test("core rejection integrity deliberately tolerates stale commercial schedule data", () => {
  const actor = authorized({
    requestData: {
      eventDate: Timestamp.fromDate(new Date("2020-01-01T00:00:00+08:00")),
      eventTime: "malformed",
      guestCount: 999999,
      services: [],
      amount: 1,
    },
  });

  assert.equal(core(mainEvent(), actor).mainEventStatus, "pending_provider_approval");
});
