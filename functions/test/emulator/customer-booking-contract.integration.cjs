const assert = require("node:assert/strict");

const {
  deleteApp: deleteAdminApp,
  initializeApp: initializeAdminApp,
} = require("firebase-admin/app");
const {
  getAuth: getAdminAuth,
} = require("firebase-admin/auth");
const {
  getFirestore,
  Timestamp,
} = require("firebase-admin/firestore");
const {
  deleteApp,
  initializeApp,
} = require("firebase/app");
const {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} = require("firebase/auth");

const projectId = process.env.GCLOUD_PROJECT ??
  "demo-feasta-customer-booking";
const authHost = requiredEnv(
  "FIREBASE_AUTH_EMULATOR_HOST",
);
const functionsHost =
  process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:55001";
const password = "FeastaTest!2026";
const clientApp = initializeApp(
  {
    apiKey: "fake-api-key",
    projectId,
  },
  `customer-booking-${Date.now()}`,
);
const auth = getAuth(clientApp);
connectAuthEmulator(
  auth,
  `http://${authHost}`,
  {disableWarnings: true},
);
const adminApp = initializeAdminApp(
  {projectId},
  `customer-booking-admin-${Date.now()}`,
);
const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);

void run();

async function run() {
  try {
    const fixture = await createFixture();

    await assertCustomerAvailabilityPrecheck(
      fixture,
    );
    await assertGuestValidationCreatesNothing(
      fixture,
    );
    await assertLeadTimeCreatesNothing(
      fixture,
    );
    await assertUnavailableDateCreatesNothing(
      fixture,
    );
    await assertCapacityCreatesNothing(
      fixture,
    );
    await assertIndependentProviderCreatesNothing(
      fixture,
    );
    await assertConflictCreatesNothing(
      fixture,
    );
    await assertTrustedCreationAndReplay(
      fixture,
    );

    console.log(
      "Customer booking contract integration passed.",
    );
  } finally {
    await signOut(auth).catch(() => undefined);
    await deleteApp(clientApp);
    await deleteAdminApp(adminApp);
  }
}

async function assertCustomerAvailabilityPrecheck(fixture) {
  const payload = availabilityPayload(fixture);
  const available = await callCallable(
    "checkCustomerProviderAvailability",
    payload,
  );

  assert.deepEqual(
    new Set(available.results.map((result) => result.providerId)),
    new Set([fixture.providerId, fixture.independentProviderId]),
  );
  assert.ok(available.results.every((result) => result.available));
  assert.doesNotMatch(
    JSON.stringify(available),
    /ownerId|unavailableDates|availableStaffCount|availableEquipmentCount|providerRequestId/u,
  );

  await db.collection("providers").doc(fixture.providerId).update({
    bookingLeadTimeDays: 60,
  });
  const leadTime = await callCallable(
    "checkCustomerProviderAvailability",
    payload,
  );
  assert.deepEqual(
    leadTime.results.find((result) => result.providerId === fixture.providerId),
    {
      providerId: fixture.providerId,
      available: false,
      reasonCode: "LEAD_TIME_NOT_MET",
      message: "Requires booking at least 60 days in advance.",
    },
  );

  await db.collection("providers").doc(fixture.providerId).update({
    bookingLeadTimeDays: 0,
    unavailableDates: [fixture.eventDate],
  });
  const blocked = await callCallable(
    "checkCustomerProviderAvailability",
    payload,
  );
  assert.equal(
    blocked.results.find((result) => result.providerId === fixture.providerId)?.reasonCode,
    "BLOCKED_DATE",
  );

  await db.collection("providers").doc(fixture.providerId).update({
    unavailableDates: [],
    maxGuestsPerEvent: 40,
  });
  const capacity = await callCallable(
    "checkCustomerProviderAvailability",
    payload,
  );
  assert.equal(
    capacity.results.find((result) => result.providerId === fixture.providerId)?.reasonCode,
    "GUEST_CAPACITY_EXCEEDED",
  );
  await db.collection("providers").doc(fixture.providerId).update({
    maxGuestsPerEvent: 500,
  });

  await assert.rejects(
    () => callCallable("checkCustomerProviderAvailability", {
      ...payload,
      packageId: "../private",
    }),
    /INVALID_ARGUMENT/u,
  );
  await assert.rejects(
    () => callCallable("checkCustomerProviderAvailability", {
      ...payload,
      addonIds: Array.from(
        {length: 21},
        (_, index) => `addon_excess_${String(index).padStart(8, "0")}`,
      ),
    }),
    /INVALID_ARGUMENT/u,
  );

  await signOut(auth);
  await assert.rejects(
    () => callCallable("checkCustomerProviderAvailability", payload, false),
    /UNAUTHENTICATED/u,
  );
  await signInWithEmailAndPassword(
    auth,
    "customer.booking.contract@feasta.test",
    password,
  );
}

async function createFixture() {
  const email =
    "customer.booking.contract@feasta.test";
  const phoneNumber = "+639171234568";
  const customer =
    await adminAuth.createUser({
      email,
      password,
      emailVerified: true,
      phoneNumber,
    });
  const providerId =
    "provider_booking_contract";
  const providerOwnerId =
    "provider_booking_contract_owner";
  const packageId =
    "package_booking_contract";
  const providerOwnedAddonId =
    "addon_booking_contract_owned";
  const independentAddonId =
    "addon_booking_contract_photography";
  const independentProviderId =
    "provider_booking_contract_photography";
  const independentProviderOwnerId =
    "provider_booking_contract_photography_owner";
  const eventDate = futureDateKey(30);

  await Promise.all([
    db.collection("users")
      .doc(customer.uid)
      .set({
        uid: customer.uid,
        role: "customer",
        accountStatus: "active",
        isActive: true,
        isBlocked: false,
        isPhoneVerified: true,
        phoneNumber,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    db.collection("customers")
      .doc(customer.uid)
      .set({
        userId: customer.uid,
        firstName: "Booking",
        lastName: "Customer",
        email,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
    db.collection("users")
      .doc(providerOwnerId)
      .set({
        uid: providerOwnerId,
        role: "provider",
        providerId,
        accountStatus: "active",
        isActive: true,
        isBlocked: false,
      }),
    db.collection("users")
      .doc(independentProviderOwnerId)
      .set({
        uid: independentProviderOwnerId,
        role: "provider",
        providerId: independentProviderId,
        accountStatus: "active",
        isActive: true,
        isBlocked: false,
      }),
    db.collection("providers")
      .doc(providerId)
      .set({
        ownerId: providerOwnerId,
        businessName: "Trusted Catering",
        description: "Trusted booking test provider.",
        address: "1 Test Street",
        city: "Cebu City",
        province: "Cebu",
        verificationStatus: "approved",
        publiclyVisible: true,
        isActive: true,
        isSuspended: false,
        isDeleted: false,
        providerServiceType: "catering",
        providerCategory: "catering_service",
        serviceCategories: ["catering_service"],
        eventTypesSupported: ["wedding"],
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
        acceptsMultipleEventsPerDay: true,
        maxEventsPerDay: 2,
        minGuestsPerEvent: 1,
        maxGuestsPerEvent: 500,
        availableStaffCount: 10,
        availableEquipmentCount: 10,
      }),
    db.collection("providers")
      .doc(independentProviderId)
      .set({
        ownerId: independentProviderOwnerId,
        businessName: "Trusted Photography",
        description: "Trusted independent event service.",
        address: "2 Test Street",
        city: "Cebu City",
        province: "Cebu",
        verificationStatus: "approved",
        publiclyVisible: true,
        isActive: true,
        isSuspended: false,
        isDeleted: false,
        providerServiceType: "addon",
        providerCategory: "photographer",
        serviceCategories: ["photographer"],
        eventTypesSupported: ["wedding"],
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
        acceptsMultipleEventsPerDay: true,
        maxEventsPerDay: 2,
        minGuestsPerEvent: 0,
        maxGuestsPerEvent: 0,
        availableStaffCount: 0,
        availableEquipmentCount: 0,
      }),
    db.collection("packages")
      .doc(packageId)
      .set({
        providerId,
        name: "Trusted Wedding Package",
        description: "A published package for tests.",
        eventType: "wedding",
        price: 10_000,
        downPaymentPercentage: 20,
        minimumGuests: 25,
        maximumGuests: 100,
        foodInclusions: [],
        decorInclusions: [],
        furnitureInclusions: [],
        serviceInclusions: ["Coordination"],
        status: "published",
        isActive: true,
        isPublished: true,
        providerPubliclyVisible: true,
        isDeleted: false,
      }),
    db.collection("addons")
      .doc(providerOwnedAddonId)
      .set({
        providerId,
        ownerId: providerOwnerId,
        name: "Additional Staff",
        category: "catering_service",
        price: 2_000,
        downPaymentPercentage: 25,
        status: "published",
        isActive: true,
        isAvailable: true,
        isPublished: true,
        isDeleted: false,
      }),
    db.collection("addons")
      .doc(independentAddonId)
      .set({
        providerId: independentProviderId,
        ownerId: independentProviderOwnerId,
        name: "Wedding Photography",
        category: "photographer",
        price: 5_000,
        downPaymentPercentage: 30,
        status: "published",
        isActive: true,
        isAvailable: true,
        isPublished: true,
        isDeleted: false,
      }),
  ]);

  await signInWithEmailAndPassword(
    auth,
    email,
    password,
  );

  return {
    customer,
    providerId,
    packageId,
    providerOwnedAddonId,
    independentAddonId,
    independentProviderId,
    eventDate,
  };
}

async function assertGuestValidationCreatesNothing(
  fixture,
) {
  const payload = bookingPayload(
    fixture,
    "guest-range-rejected",
    {guestCount: 24},
  );

  await assert.rejects(
    () => callFunction(payload),
    /Guest count is outside/u,
  );
  await assertNoBooking(payload);
}

async function assertUnavailableDateCreatesNothing(
  fixture,
) {
  await db.collection("providers")
    .doc(fixture.providerId)
    .update({
      unavailableDates: [fixture.eventDate],
    });
  const payload = bookingPayload(
    fixture,
    "unavailable-date-rejected",
  );

  await assert.rejects(
    () => callFunction(payload),
    /Provider unavailable for the selected schedule/u,
  );
  await assertNoBooking(payload);
  await db.collection("providers")
    .doc(fixture.providerId)
    .update({unavailableDates: []});
}

async function assertLeadTimeCreatesNothing(fixture) {
  await db.collection("providers")
    .doc(fixture.providerId)
    .update({bookingLeadTimeDays: 60});
  const payload = bookingPayload(
    fixture,
    "lead-time-rejected",
  );

  await assert.rejects(
    () => callFunction(payload),
    /Provider unavailable for the selected schedule/u,
  );
  await assertNoBooking(payload);
  await db.collection("providers")
    .doc(fixture.providerId)
    .update({bookingLeadTimeDays: 0});
}

async function assertCapacityCreatesNothing(fixture) {
  await db.collection("providers")
    .doc(fixture.providerId)
    .update({maxGuestsPerEvent: 40});
  const payload = bookingPayload(
    fixture,
    "provider-capacity-rejected",
  );

  await assert.rejects(
    () => callFunction(payload),
    /Provider unavailable for the selected schedule/u,
  );
  await assertNoBooking(payload);
  await db.collection("providers")
    .doc(fixture.providerId)
    .update({maxGuestsPerEvent: 500});
}

async function assertIndependentProviderCreatesNothing(fixture) {
  await db.collection("providers")
    .doc(fixture.independentProviderId)
    .update({unavailableDates: [fixture.eventDate]});
  const payload = bookingPayload(
    fixture,
    "independent-provider-rejected",
  );

  await assert.rejects(
    () => callFunction(payload),
    /Provider unavailable for the selected schedule/u,
  );
  await assertNoBooking(payload);
  await db.collection("providers")
    .doc(fixture.independentProviderId)
    .update({unavailableDates: []});
}

async function assertConflictCreatesNothing(
  fixture,
) {
  const eventDate = Timestamp.fromDate(
    new Date(
      `${fixture.eventDate}T12:00:00+08:00`,
    ),
  );

  await db.collection("providerRequests")
    .doc("existing_booking_contract")
    .set({
      providerRequestId:
        "existing_booking_contract",
      mainEventId:
        "existing_booking_contract_event",
      customerId: "another_customer",
      providerId: fixture.providerId,
      type: "catering",
      status: "confirmed",
      eventDate,
      eventTime: "11:00",
      eventEndTime: "13:00",
      guestCount: 50,
    });
  const payload = bookingPayload(
    fixture,
    "time-conflict-rejected",
  );

  await assert.rejects(
    () => callFunction(payload),
    /Provider unavailable for the selected schedule/u,
  );
  await assertNoBooking(payload);
}

async function assertTrustedCreationAndReplay(
  fixture,
) {
  const payload = bookingPayload(
    fixture,
    "trusted-valid-booking",
    {
      eventTime: "14:00",
      eventEndTime: "16:00",
      customerId: "attacker-controlled",
      price: 1,
      totalAmount: 1,
      downPaymentAmount: 0,
    },
  );
  const created = await callFunction(payload);

  assert.equal(created.created, true);

  const eventReference = db.collection("mainEvents")
    .doc(created.bookingId);
  const requestsReference = db.collection("providerRequests")
    .where("mainEventId", "==", created.bookingId);
  const [event, requests] =
    await Promise.all([
      eventReference.get(),
      requestsReference.get(),
    ]);
  const cateringRequest = requests.docs.find(
    (document) => document.data().type === "catering",
  );
  const independentRequest = requests.docs.find(
    (document) =>
      document.data().providerId === fixture.independentProviderId,
  );

  assert.equal(requests.size, 2);
  assert.equal(created.providerRequestIds.length, 2);
  assert.equal(
    event.data()?.customerId,
    fixture.customer.uid,
  );
  assert.equal(
    event.data()?.providerId,
    fixture.providerId,
  );
  assert.equal(event.data()?.packagePrice, 10_000);
  assert.equal(event.data()?.cateringAddOnsTotal, 2_000);
  assert.equal(event.data()?.marketplaceAddOnsTotal, 5_000);
  assert.equal(event.data()?.estimatedEventTotal, 17_000);
  assert.equal(event.data()?.totalAmount, 12_000);
  assert.equal(event.data()?.downPaymentAmount, 2_500);
  assert.deepEqual(
    new Set(event.data()?.providerRequestIds),
    new Set(requests.docs.map((document) => document.id)),
  );
  assert.equal(cateringRequest?.data().status, "pending");
  assert.equal(cateringRequest?.data().amount, 12_000);
  assert.deepEqual(
    new Set(cateringRequest?.data().services.map((service) => service.serviceId)),
    new Set([fixture.packageId, fixture.providerOwnedAddonId]),
  );
  assert.equal(independentRequest?.data().status, "pending");
  assert.equal(independentRequest?.data().amount, 5_000);
  assert.equal(independentRequest?.data().downPaymentAmount, 1_500);
  assert.deepEqual(
    independentRequest?.data().services.map((service) => service.serviceId),
    [fixture.independentAddonId],
  );

  await db.collection("packages")
    .doc(fixture.packageId)
    .update({
      status: "archived",
      isActive: false,
      isPublished: false,
      providerPubliclyVisible: false,
    });

  const replay = await callFunction(payload);
  assert.equal(replay.created, false);
  assert.equal(replay.bookingId, created.bookingId);
  assert.deepEqual(
    replay.providerRequestIds,
    created.providerRequestIds,
  );
  assert.equal(
    (await db.collection("mainEvents").get()).size,
    1,
  );
  assert.equal(
    (await db.collection("providerRequests")
      .where("customerId", "==", fixture.customer.uid)
      .get()).size,
    2,
  );
  assert.equal(
    (await db.collection("bookings").get()).size,
    0,
  );
}

function bookingPayload(
  fixture,
  clientRequestId,
  overrides = {},
) {
  return {
    clientRequestId,
    providerId: fixture.providerId,
    packageId: fixture.packageId,
    eventType: "wedding",
    eventDate: fixture.eventDate,
    eventTime: "10:00",
    eventEndTime: "12:00",
    eventLocation: "Cebu City",
    eventAddress: "1 Customer Street, Cebu City",
    guestCount: 50,
    selectedFoods: [],
    selectedDecorations: [],
    selectedFurniture: [],
    addonIds: [
      fixture.providerOwnedAddonId,
      fixture.independentAddonId,
    ],
    specialRequest: "",
    willArrangeOwnAddOns: false,
    customerArrangedAddOnsNote: "",
    ...overrides,
  };
}

function availabilityPayload(fixture, overrides = {}) {
  return {
    packageId: fixture.packageId,
    addonIds: [
      fixture.providerOwnedAddonId,
      fixture.independentAddonId,
    ],
    eventDate: fixture.eventDate,
    eventTime: "10:00",
    eventEndTime: "12:00",
    guestCount: 50,
    ...overrides,
  };
}

async function assertNoBooking(payload) {
  const bookingId = require("node:crypto")
    .createHash("sha256")
    .update(
      `${auth.currentUser.uid}:${payload.clientRequestId}`,
    )
    .digest("hex")
    .slice(0, 40);
  const event = await db
    .collection("mainEvents")
    .doc(bookingId)
    .get();
  const requests = await db
    .collection("providerRequests")
    .where("mainEventId", "==", bookingId)
    .get();

  assert.equal(event.exists, false);
  assert.equal(requests.empty, true);
}

async function callFunction(data) {
  return callCallable("submitBookingRequest", data);
}

async function callCallable(functionName, data, authenticated = true) {
  const authorization = authenticated
    ? `Bearer ${await auth.currentUser.getIdToken(true)}`
    : null;
  const response = await fetch(
    `http://${functionsHost}/${projectId}/asia-southeast1/${functionName}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorization ? {authorization} : {}),
      },
      body: JSON.stringify({data}),
    },
  );
  const body = await response.json();

  if (!response.ok || body.error) {
    throw new Error(
      `${body.error?.status ?? response.status}: ` +
      `${body.error?.message ?? "Callable failed"}`,
    );
  }

  return body.result;
}

function futureDateKey(days) {
  const date = new Date(
    Date.now() + days * 24 * 60 * 60 * 1_000,
  );

  return new Intl.DateTimeFormat(
    "en-CA",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Manila",
    },
  ).format(date);
}

function requiredEnv(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required.`);
  return value;
}
