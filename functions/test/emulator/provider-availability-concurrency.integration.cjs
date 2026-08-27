const assert = require("node:assert/strict");

const {
  deleteApp: deleteAdminApp,
  initializeApp: initializeAdminApp,
} = require("firebase-admin/app");
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
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} = require("firebase/auth");

const projectId = process.env.GCLOUD_PROJECT ??
  "demo-feasta-provider-availability";
const authHost = requiredEnv(
  "FIREBASE_AUTH_EMULATOR_HOST",
);
const functionsHost =
  process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST ??
  "127.0.0.1:55201";
const clientApp = initializeApp(
  {
    apiKey: "fake-api-key",
    projectId,
  },
  `provider-availability-${Date.now()}`,
);
const auth = getAuth(clientApp);
connectAuthEmulator(
  auth,
  `http://${authHost}`,
  {disableWarnings: true},
);
const adminApp = initializeAdminApp(
  {projectId},
  `provider-availability-admin-${Date.now()}`,
);
const db = getFirestore(adminApp);

void run();

async function run() {
  try {
    const owner = (
      await createUserWithEmailAndPassword(
        auth,
        "provider.availability.owner@feasta.test",
        "FeastaTest!2026",
      )
    ).user;
    const providerId = "provider_availability_owner";
    const eventDate = futureEventDate();

    await Promise.all([
      db.collection("users").doc(owner.uid).set({
        uid: owner.uid,
        role: "provider",
        providerId,
        accountStatus: "active",
        isActive: true,
        isBlocked: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }),
      db.collection("providers").doc(providerId).set({
        ownerId: owner.uid,
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
        minGuestsPerEvent: 1,
        maxGuestsPerEvent: 500,
        availableStaffCount: 10,
        availableEquipmentCount: 10,
      }),
      seedRequest({
        providerId,
        requestId: "availability_request_one",
        mainEventId: "availability_event_one",
        customerId: "availability_customer_one",
        eventDate,
        eventTime: "10:00",
        eventEndTime: "12:00",
      }),
      seedRequest({
        providerId,
        requestId: "availability_request_two",
        mainEventId: "availability_event_two",
        customerId: "availability_customer_two",
        eventDate,
        eventTime: "13:00",
        eventEndTime: "15:00",
      }),
    ]);

    const outcomes = await Promise.allSettled([
      callFunction(
        "acceptProviderRequest",
        owner,
        {providerRequestId: "availability_request_one"},
      ),
      callFunction(
        "acceptProviderRequest",
        owner,
        {providerRequestId: "availability_request_two"},
      ),
    ]);
    const fulfilled = outcomes.filter(
      (outcome) => outcome.status === "fulfilled",
    );
    const rejected = outcomes.filter(
      (outcome) => outcome.status === "rejected",
    );

    const outcomeSummary = outcomes.map((outcome) =>
      outcome.status === "fulfilled"
        ? "fulfilled"
        : `rejected: ${outcome.reason?.message ?? "unknown"}`
    );
    assert.equal(fulfilled.length, 1, JSON.stringify(outcomeSummary));
    assert.equal(rejected.length, 1, JSON.stringify(outcomeSummary));
    assert.match(
      rejected[0].reason.message,
      /FAILED_PRECONDITION/u,
    );

    const requests = await Promise.all([
      db.collection("providerRequests")
        .doc("availability_request_one")
        .get(),
      db.collection("providerRequests")
        .doc("availability_request_two")
        .get(),
    ]);
    const statuses = requests.map(
      (snapshot) => snapshot.data()?.status,
    ).sort();

    assert.deepEqual(statuses, ["confirmed", "pending"]);
    console.log(
      "Provider availability concurrency integration passed.",
    );
  } finally {
    await signOut(auth).catch(() => undefined);
    await deleteApp(clientApp);
    await deleteAdminApp(adminApp);
  }
}

async function seedRequest(input) {
  const packageId = `package_${input.requestId}`;
  const packageName = "Concurrency Package";
  const eventType = "wedding";
  const eventLocation = "Ormoc City";
  const eventAddress = "123 Concurrency Street";
  const guestCount = 50;

  await db.collection("mainEvents")
    .doc(input.mainEventId)
    .set({
      bookingId: input.mainEventId,
      mainEventId: input.mainEventId,
      customerId: input.customerId,
      providerId: input.providerId,
      currentProviderId: input.providerId,
      packageId,
      packageName,
      packagePrice: 10_000,
      totalAmount: 10_000,
      downPaymentPercentage: 0,
      downPaymentAmount: 0,
      remainingBalance: 10_000,
      selectedAddOns: [],
      providerRequestIds: [input.requestId],
      status: "pending_provider_approval",
      eventDate: input.eventDate,
      eventTime: input.eventTime,
      eventEndTime: input.eventEndTime,
      eventType,
      guestCount,
      eventLocation,
      eventAddress,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  await db.collection("providerRequests")
    .doc(input.requestId)
    .set({
      providerRequestId: input.requestId,
      bookingId: input.mainEventId,
      mainEventId: input.mainEventId,
      customerId: input.customerId,
      providerId: input.providerId,
      type: "catering",
      status: "pending",
      isRequired: true,
      amount: 10_000,
      downPaymentPercentage: 0,
      downPaymentAmount: 0,
      remainingBalance: 10_000,
      eventDate: input.eventDate,
      eventTime: input.eventTime,
      eventEndTime: input.eventEndTime,
      eventType,
      guestCount,
      eventLocation,
      eventAddress,
      packageId,
      packageName,
      services: [{
        serviceId: packageId,
        name: packageName,
        category: "catering",
        price: 10_000,
        downPaymentPercentage: 0,
        downPaymentAmount: 0,
      }],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
}

function futureEventDate() {
  const future = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1_000,
  );
  const key = new Intl.DateTimeFormat(
    "en-CA",
    {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: "Asia/Manila",
    },
  ).format(future);

  return Timestamp.fromDate(
    new Date(`${key}T12:00:00+08:00`),
  );
}

async function callFunction(name, user, data) {
  const response = await fetch(
    `http://${functionsHost}/${projectId}/asia-southeast1/${name}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization:
          `Bearer ${await user.getIdToken(true)}`,
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

function requiredEnv(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required.`);
  return value;
}
