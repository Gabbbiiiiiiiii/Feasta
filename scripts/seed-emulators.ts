import {getApps, initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {Timestamp, getFirestore} from "firebase-admin/firestore";

const projectId = process.env.GCLOUD_PROJECT ?? "feasta-catering-system";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "127.0.0.1:9199";

process.env.GCLOUD_PROJECT = projectId;
process.env.FIREBASE_AUTH_EMULATOR_HOST = authHost;
process.env.FIRESTORE_EMULATOR_HOST = firestoreHost;
process.env.FIREBASE_STORAGE_EMULATOR_HOST = storageHost;

assertLocalEmulator(authHost, "Auth");
assertLocalEmulator(firestoreHost, "Firestore");
assertLocalEmulator(storageHost, "Storage");

const app = getApps()[0] ?? initializeApp({
  projectId,
  storageBucket: `${projectId}.appspot.com`,
});
const auth = getAuth(app);
const db = getFirestore(app);
const password = "FeastaTest!2026";

const accounts = [
  {uid: "dev-customer", email: "customer@feasta.test", role: "customer"},
  {uid: "dev-provider-pending", email: "provider.pending@feasta.test", role: "provider"},
  {uid: "dev-provider-submitted", email: "provider.submitted@feasta.test", role: "provider"},
  {uid: "dev-provider-approved", email: "provider.approved@feasta.test", role: "provider"},
  {uid: "dev-admin", email: "admin@feasta.test", role: "admin"},
] as const;

for (const account of accounts) {
  try {
    await auth.getUser(account.uid);
    await auth.updateUser(account.uid, {
      email: account.email,
      password,
      emailVerified: true,
      disabled: false,
      displayName: account.email.split("@")[0],
    });
  } catch (error) {
    if (!isAuthUserNotFound(error)) throw error;
    await auth.createUser({
      uid: account.uid,
      email: account.email,
      password,
      emailVerified: true,
      disabled: false,
      displayName: account.email.split("@")[0],
    });
  }
  await auth.setCustomUserClaims(account.uid, {role: account.role});
}

const now = Timestamp.fromDate(new Date("2026-01-15T08:00:00.000Z"));
const eventDate = Timestamp.fromDate(new Date("2026-08-15T02:00:00.000Z"));
const activeUser = (uid: string, email: string, role: string, providerId: string | null = null) => ({
  uid,
  email,
  firstName: role === "admin" ? "Dev" : "Test",
  lastName: role === "admin" ? "Admin" : "Account",
  role,
  providerId,
  accountStatus: "active",
  isActive: true,
  isBlocked: false,
  isEmailVerified: true,
  isPhoneVerified: false,
  authProvider: "password",
  createdAt: now,
  updatedAt: now,
});
const retained = {
  isDeleted: false,
  deletedAt: null,
  deletedBy: null,
  deletionReason: null,
};

const documents: Record<string, Record<string, unknown>> = {
  "users/dev-customer": activeUser("dev-customer", "customer@feasta.test", "customer"),
  "users/dev-provider-pending": activeUser("dev-provider-pending", "provider.pending@feasta.test", "provider", "provider-pending"),
  "users/dev-provider-submitted": activeUser("dev-provider-submitted", "provider.submitted@feasta.test", "provider", "provider-submitted"),
  "users/dev-provider-approved": activeUser("dev-provider-approved", "provider.approved@feasta.test", "provider", "provider-approved"),
  "users/dev-admin": activeUser("dev-admin", "admin@feasta.test", "admin"),
  "customers/dev-customer": {
    userId: "dev-customer",
    email: "customer@feasta.test",
    firstName: "Test",
    lastName: "Customer",
    phoneNumber: "+639170000001",
    createdAt: now,
    updatedAt: now,
  },
  "providers/provider-pending": provider("dev-provider-pending", "Draft Events", "draft", false),
  "providers/provider-submitted": provider("dev-provider-submitted", "Submitted Catering", "submitted", false),
  "providers/provider-approved": provider("dev-provider-approved", "Approved Feasta Catering", "approved", true),
  "providerVerifications/verification-draft": verification("provider-pending", "dev-provider-pending", "draft"),
  "providerVerifications/verification-submitted": verification("provider-submitted", "dev-provider-submitted", "submitted"),
  "providerVerifications/verification-approved": verification("provider-approved", "dev-provider-approved", "approved"),
  "providerVerifications/verification-submitted/documents/business_permit": verificationDocument("verification-submitted", "provider-submitted", "dev-provider-submitted", "business_permit"),
  "providerVerifications/verification-submitted/documents/valid_id": verificationDocument("verification-submitted", "provider-submitted", "dev-provider-submitted", "valid_id"),
  "packages/package-approved-wedding": {
    providerId: "provider-approved",
    name: "Classic Wedding Package",
    description: "A complete seeded wedding catering package.",
    eventType: "wedding",
    price: 45000,
    downPaymentPercentage: 30,
    downPaymentAmount: 13500,
    guestCapacity: 100,
    isActive: true,
    ...retained,
    createdAt: now,
    updatedAt: now,
  },
  "menuItems/menu-approved-roast": {
    providerId: "provider-approved",
    name: "Herb Roast Chicken",
    description: "Seeded main course",
    category: "main_course",
    pricePerServing: 250,
    isAvailable: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  "addons/addon-approved-photo": {
    providerId: "provider-approved",
    providerBusinessName: "Approved Feasta Catering",
    providerType: "catering_provider",
    name: "Photo Booth",
    category: "entertainment",
    description: "Three-hour photo booth service.",
    price: 7000,
    isAvailable: true,
    isActive: true,
    ...retained,
    createdAt: now,
    updatedAt: now,
  },
  "mainEvents/event-seed-wedding": {
    customerId: "dev-customer",
    providerId: "provider-approved",
    eventName: "Seed Wedding",
    eventDate,
    status: "confirmed",
    createdAt: now,
    updatedAt: now,
  },
  "providerRequests/request-seed-catering": {
    mainEventId: "event-seed-wedding",
    customerId: "dev-customer",
    providerId: "provider-approved",
    providerRequestType: "catering",
    packageId: "package-approved-wedding",
    status: "confirmed",
    createdAt: now,
    updatedAt: now,
  },
  "bookings/booking-seed-legacy": {
    customerId: "dev-customer",
    providerId: "provider-approved",
    mainEventId: "event-seed-wedding",
    status: "confirmed",
    paymentStatus: "partially_paid",
    createdAt: now,
    updatedAt: now,
  },
  "payments/payment-seed-deposit": {
    customerId: "dev-customer",
    providerId: "provider-approved",
    mainEventId: "event-seed-wedding",
    providerRequestId: "request-seed-catering",
    amount: 13500,
    amountInCentavos: 1350000,
    currency: "PHP",
    gateway: "paymongo",
    paymentType: "provider_down_payment",
    status: "paid",
    paidAt: now,
    createdAt: now,
    updatedAt: now,
  },
  "notifications/notification-seed": {
    userId: "dev-customer",
    title: "Seed booking confirmed",
    message: "Your seeded event is ready for development testing.",
    type: "booking",
    relatedId: "event-seed-wedding",
    isRead: false,
    readAt: null,
    createdAt: now,
    updatedAt: now,
  },
  "reviews/review-seed": {
    bookingId: "booking-seed-legacy",
    customerId: "dev-customer",
    providerId: "provider-approved",
    rating: 5,
    comment: "Excellent seeded service.",
    isVisible: true,
    moderationStatus: "published",
    ...retained,
    createdAt: now,
    updatedAt: now,
  },
  "complaints/complaint-seed": {
    userId: "dev-customer",
    providerId: "provider-approved",
    description: "Seeded complaint for admin workflow testing.",
    status: "submitted",
    evidenceUrls: [],
    ...retained,
    createdAt: now,
    updatedAt: now,
  },
  "announcements/announcement-seed": {
    title: "Welcome to the FEASTA emulator",
    body: "This announcement is deterministic seed data.",
    audience: "everyone",
    status: "published",
    ...retained,
    createdAt: now,
    updatedAt: now,
  },
  "appSettings/public": {
    isPublic: true,
    maintenanceMode: false,
    supportEmail: "support@feasta.test",
    seededAt: now,
  },
};

let batch = db.batch();
let writes = 0;
for (const [path, data] of Object.entries(documents)) {
  batch.set(db.doc(path), data, {merge: true});
  writes++;
  if (writes % 400 === 0) {
    await batch.commit();
    batch = db.batch();
  }
}
if (writes % 400 !== 0) await batch.commit();

console.log(`Seeded ${accounts.length} Auth users and ${writes} Firestore documents.`);
console.log(`Test password: ${password}`);

function provider(ownerId: string, businessName: string, verificationStatus: string, isActive: boolean) {
  return {
    ownerId,
    businessName,
    businessEmail: `${ownerId}@feasta.test`,
    businessPhone: "+639170000002",
    ownerFirstName: "Test",
    ownerLastName: "Provider",
    description: "Deterministic provider profile for emulator development.",
    address: "Ormoc City",
    location: "Ormoc City, Leyte",
    city: "Ormoc City",
    province: "Leyte",
    providerServiceType: "catering",
    providerCategory: "full_service",
    verificationStatus,
    searchTokens: ["approved", "submitted", "draft", "catering", "ormoc"],
    eventTypesSupported: ["wedding", "birthday"],
    serviceAreas: ["Ormoc City"],
    favoriteCount: isActive ? 10 : 0,
    ratingAverage: isActive ? 5 : 0,
    reviewCount: isActive ? 1 : 0,
    isActive,
    isFeatured: isActive,
    isSuspended: false,
    ...retained,
    createdAt: now,
    updatedAt: now,
  };
}

function verification(providerId: string, ownerId: string, status: string) {
  return {
    providerId,
    ownerId,
    businessName: providerId,
    providerServiceType: "catering",
    status,
    submittedAt: status === "submitted" || status === "approved" ? now : null,
    reviewedAt: status === "approved" ? now : null,
    reviewedBy: status === "approved" ? "dev-admin" : null,
    approvedAt: status === "approved" ? now : null,
    rejectionReason: null,
    remarks: null,
    createdAt: now,
    updatedAt: now,
  };
}

function verificationDocument(verificationId: string, providerId: string, ownerId: string, documentType: string) {
  return {
    verificationId,
    providerId,
    ownerId,
    documentType,
    displayName: documentType,
    isRequired: true,
    storagePath: `providers/${providerId}/verification/${documentType}/seed.pdf`,
    originalFileName: "seed.pdf",
    contentType: "application/pdf",
    fileSize: 1024,
    status: "pending",
    rejectionReason: null,
    verifiedAt: null,
    verifiedBy: null,
    createdAt: now,
    updatedAt: now,
  };
}

function assertLocalEmulator(host: string, name: string): void {
  const hostname = host.split(":")[0]?.toLowerCase();
  if (!hostname || !["127.0.0.1", "localhost", "::1"].includes(hostname)) {
    throw new Error(`${name} host must be local; received ${host}.`);
  }
}

function isAuthUserNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null &&
    "code" in error && error.code === "auth/user-not-found";
}
