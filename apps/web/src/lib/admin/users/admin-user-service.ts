import "server-only";

import {
  FieldPath,
  FieldValue,
  Timestamp,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";

import {
  type AdminAccountStatus,
  type AdminManagedRole,
  type AdminUser,
  AdminUserActivityEntry,
  AdminUserBookingSummary,
  AdminUserDetailsResult,
  AdminUserVerificationDocument,
  type AdminUserFilters,
  type AdminUserPage,
  type AdminUserStatistics,
  type AdminVerificationStatus,
  type ManageAdminAccountAccessInput,
  type ManageAdminAccountAccessResult,
} from "@/lib/admin/users/admin-user-types";
import { requireAdmin } from "@/lib/auth/session";
import {
  adminAuth,
  adminDb,
} from "@/lib/firebase/admin";

const USERS_COLLECTION = "users";
const CUSTOMERS_COLLECTION = "customers";
const PROVIDERS_COLLECTION = "providers";
const ADMIN_LOGS_COLLECTION = "adminLogs";
const MAIN_EVENTS_COLLECTION = "mainEvents";
const PROVIDER_REQUESTS_COLLECTION =
  "providerRequests";
const PROVIDER_VERIFICATIONS_COLLECTION =
  "providerVerifications";

const USER_DETAIL_BOOKING_LIMIT = 10;
const USER_DETAIL_ACTIVITY_LIMIT = 15;
const USER_DETAIL_DOCUMENT_LIMIT = 30;
const NOTIFICATIONS_COLLECTION =
  "notifications";

const WHERE_IN_LIMIT = 30;
const MAX_BATCH_WRITES = 500;
const MAX_PROVIDER_WRITES = MAX_BATCH_WRITES - 2;

type CursorPayload = {
  createdAtMilliseconds: number;
  documentId: string;
};

type ProviderDocument = {
  id: string;
  ownerId: string;
  businessName: string | null;
  providerServiceType: string | null;
  providerCategory: string | null;
  verificationStatus: AdminVerificationStatus;
};



function stringValue(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : value == null
      ? ""
      : String(value).trim();
}

function nullableString(value: unknown) {
  const result = stringValue(value);

  return result.length > 0 ? result : null;
}

function booleanValue(
  value: unknown,
  defaultValue = false,
) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (normalized === "true") {
      return true;
    }

    if (normalized === "false") {
      return false;
    }
  }

  return defaultValue;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return new Date(value);
  }

  if (typeof value === "string") {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime())
      ? null
      : parsed;
  }

  return null;
}

function isoDateValue(value: unknown) {
  return dateValue(value)?.toISOString() ?? null;
}

function normalizeRole(
  value: unknown,
): AdminManagedRole | null {
  const role = stringValue(value).toLowerCase();

  if (role === "customer" || role === "provider") {
    return role;
  }

  return null;
}

function normalizeVerificationStatus(
  value: unknown,
): AdminVerificationStatus {
  const status = stringValue(value).toLowerCase();

  switch (status) {
    case "approved":
    case "verified":
      return "verified";

    case "rejected":
    case "resubmission_required":
      return "rejected";

    case "pending":
    case "draft":
    case "submitted":
    case "under_review":
    case "":
      return "pending";

    default:
      return "pending";
  }
}

function verificationPriority(value: unknown) {
  switch (normalizeVerificationStatus(value)) {
    case "verified":
      return 3;

    case "pending":
      return 2;

    case "rejected":
      return 1;
  }
}

function resolveAccountStatus(
  isActive: boolean,
  isBlocked: boolean,
): AdminAccountStatus {
  if (isBlocked) {
    return "blocked";
  }

  if (!isActive) {
    return "disabled";
  }

  return "active";
}

function createFullName(
  firstName: string,
  lastName: string,
) {
  const fullName = `${firstName} ${lastName}`.trim();

  return fullName || "Unnamed user";
}

function createInitials(
  firstName: string,
  lastName: string,
  email: string,
) {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }

  if (firstName) {
    return firstName[0].toUpperCase();
  }

  if (email) {
    return email[0].toUpperCase();
  }

  return "U";
}

function mapUserDocument(
  document: QueryDocumentSnapshot<DocumentData>,
): AdminUser | null {
  const data = document.data();
  const role = normalizeRole(data.role);

  if (!role) {
    return null;
  }

  const firstName = stringValue(data.firstName);
  const lastName = stringValue(data.lastName);
  const email = stringValue(data.email);
  const isActive = booleanValue(data.isActive, true);
  const isBlocked = booleanValue(data.isBlocked);

  return {
    id: document.id,
    firstName,
    lastName,
    fullName: createFullName(firstName, lastName),
    initials: createInitials(
      firstName,
      lastName,
      email,
    ),
    email,
    phoneNumber: stringValue(data.phoneNumber),
    role,
    profileImageUrl: nullableString(
      data.profileImageUrl,
    ),

    isEmailVerified: booleanValue(
      data.isEmailVerified,
    ),
    isPhoneVerified: booleanValue(
      data.isPhoneVerified,
    ),
    isActive,
    isBlocked,
    accountStatus: resolveAccountStatus(
      isActive,
      isBlocked,
    ),

    createdAt: isoDateValue(data.createdAt),
    updatedAt: isoDateValue(data.updatedAt),
    lastLoginAt: isoDateValue(data.lastLoginAt),

    providerId: null,
    businessName: null,
    providerServiceType: null,
    providerCategory: null,
    verificationStatus:
      role === "provider"
        ? normalizeVerificationStatus(
            data.verificationStatus,
          )
        : null,
  };
}

function mapProviderDocument(
  document: QueryDocumentSnapshot<DocumentData>,
): ProviderDocument | null {
  const data = document.data();
  const ownerId = stringValue(data.ownerId);

  if (!ownerId) {
    return null;
  }

  return {
    id: document.id,
    ownerId,
    businessName: nullableString(data.businessName),
    providerServiceType: nullableString(
      data.providerServiceType,
    ),
    providerCategory: nullableString(
      data.providerCategory,
    ),
    verificationStatus:
      normalizeVerificationStatus(
        data.verificationStatus,
      ),
  };
}

function selectPreferredProvider(
  current: ProviderDocument | undefined,
  candidate: ProviderDocument,
) {
  if (!current) {
    return candidate;
  }

  const currentPriority = verificationPriority(
    current.verificationStatus,
  );

  const candidatePriority = verificationPriority(
    candidate.verificationStatus,
  );

  if (candidatePriority > currentPriority) {
    return candidate;
  }

  if (
    candidatePriority === currentPriority &&
    candidate.id.localeCompare(current.id) < 0
  ) {
    return candidate;
  }

  return current;
}

function chunkValues<T>(
  values: readonly T[],
  size: number,
) {
  const chunks: T[][] = [];

  for (
    let start = 0;
    start < values.length;
    start += size
  ) {
    chunks.push(values.slice(start, start + size));
  }

  return chunks;
}

async function attachProviderInformation(
  users: AdminUser[],
): Promise<AdminUser[]> {
  const providerOwnerIds = [
    ...new Set(
      users
        .filter((user) => user.role === "provider")
        .map((user) => user.id)
        .filter(Boolean),
    ),
  ];

  if (providerOwnerIds.length === 0) {
    return users;
  }

  const providerByOwnerId =
    new Map<string, ProviderDocument>();

  for (const ownerIdChunk of chunkValues(
    providerOwnerIds,
    WHERE_IN_LIMIT,
  )) {
    const snapshot = await adminDb
      .collection(PROVIDERS_COLLECTION)
      .where("ownerId", "in", ownerIdChunk)
      .get();

    for (const document of snapshot.docs) {
      const provider = mapProviderDocument(document);

      if (!provider) {
        continue;
      }

      const preferred = selectPreferredProvider(
        providerByOwnerId.get(provider.ownerId),
        provider,
      );

      providerByOwnerId.set(
        provider.ownerId,
        preferred,
      );
    }
  }

  return users.map((user) => {
    if (user.role !== "provider") {
      return user;
    }

    const provider = providerByOwnerId.get(user.id);

    if (!provider) {
      return user;
    }

    return {
      ...user,
      providerId: provider.id,
      businessName: provider.businessName,
      providerServiceType:
        provider.providerServiceType,
      providerCategory: provider.providerCategory,
      verificationStatus:
        provider.verificationStatus,
    };
  });
}

function normalizeFilters(
  filters: AdminUserFilters,
): AdminUserFilters {
  const allowedPageSizes = [10, 20, 50];

  return {
    search: filters.search.trim().toLowerCase(),

    role:
      filters.role === "customer" ||
      filters.role === "provider"
        ? filters.role
        : "all",

    accountStatus:
      filters.accountStatus === "active" ||
      filters.accountStatus === "disabled" ||
      filters.accountStatus === "blocked"
        ? filters.accountStatus
        : "all",

    verificationStatus:
      filters.verificationStatus === "verified" ||
      filters.verificationStatus === "pending" ||
      filters.verificationStatus === "rejected"
        ? filters.verificationStatus
        : "all",

    pageSize: allowedPageSizes.includes(
      filters.pageSize,
    )
      ? filters.pageSize
      : 10,

    cursor: filters.cursor ?? null,
  };
}

function applyUserFilters(
  query: Query<DocumentData>,
  filters: AdminUserFilters,
) {
  let filteredQuery = query;

  if (
    filters.role === "customer" ||
    filters.role === "provider"
  ) {
    filteredQuery = filteredQuery.where(
      "role",
      "==",
      filters.role,
    );
  } else {
    filteredQuery = filteredQuery.where(
      "role",
      "in",
      ["customer", "provider"],
    );
  }

  if (filters.accountStatus === "active") {
    filteredQuery = filteredQuery
      .where("isActive", "==", true)
      .where("isBlocked", "==", false);
  } else if (
    filters.accountStatus === "disabled"
  ) {
    filteredQuery = filteredQuery
      .where("isActive","==", false)
      .where("isBlocked", "==", false);
  } else if (
    filters.accountStatus === "blocked"
  ) {
    filteredQuery = filteredQuery.where(
      "isBlocked",
      "==",
      true,
    );
  }

  /*
   * This relies on verificationStatus being backfilled
   * into provider user documents, matching the Flutter
   * implementation.
   */
  if (
    filters.role === "provider" &&
    filters.verificationStatus !== "all"
  ) {
    filteredQuery = filteredQuery.where(
      "verificationStatus",
      "==",
      filters.verificationStatus,
    );
  }

  return filteredQuery;
}

function encodeCursor(
  document: QueryDocumentSnapshot<DocumentData>,
) {
  const createdAt = dateValue(
    document.data().createdAt,
  );

  if (!createdAt) {
    return null;
  }

  const payload: CursorPayload = {
    createdAtMilliseconds: createdAt.getTime(),
    documentId: document.id,
  };

  return Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(
  value: string | null | undefined,
): CursorPayload | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString(
        "utf8",
      ),
    ) as Partial<CursorPayload>;

    if (
      typeof parsed.createdAtMilliseconds !==
        "number" ||
      !Number.isFinite(
        parsed.createdAtMilliseconds,
      ) ||
      typeof parsed.documentId !== "string" ||
      !parsed.documentId
    ) {
      return null;
    }

    return {
      createdAtMilliseconds:
        parsed.createdAtMilliseconds,
      documentId: parsed.documentId,
    };
  } catch {
    return null;
  }
}

function matchesSearch(
  user: AdminUser,
  search: string,
) {
  const searchableText = [
    user.fullName,
    user.firstName,
    user.lastName,
    user.email,
    user.phoneNumber,
    user.businessName ?? "",
    user.providerServiceType ?? "",
    user.providerCategory ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return searchableText.includes(search);
}

function calculateAccountGrowth(
  currentMonth: number,
  previousMonth: number,
) {
  if (previousMonth === 0) {
    return currentMonth === 0 ? 0 : 100;
  }

  return (
    ((currentMonth - previousMonth) /
      previousMonth) *
    100
  );
}

const USER_STATISTICS_CACHE_MS =
  30 * 1000;

let userStatisticsCache: {
  expiresAt: number;
  promise: Promise<AdminUserStatistics>;
} | null = null;

function invalidateUserStatisticsCache() {
  userStatisticsCache = null;
}

async function queryAdminUserStatistics(): Promise<
  AdminUserStatistics
> {
  const now = new Date();
  const manilaOffsetMilliseconds =
    8 * 60 * 60 * 1000;

  const manilaNow = new Date(
    now.getTime() +
      manilaOffsetMilliseconds,
  );

  const thisMonthStart = new Date(
    Date.UTC(
      manilaNow.getUTCFullYear(),
      manilaNow.getUTCMonth(),
      1,
    ) - manilaOffsetMilliseconds,
  );

  const nextMonthStart = new Date(
    Date.UTC(
      manilaNow.getUTCFullYear(),
      manilaNow.getUTCMonth() + 1,
      1,
    ) - manilaOffsetMilliseconds,
  );

  const previousMonthStart = new Date(
    Date.UTC(
      manilaNow.getUTCFullYear(),
      manilaNow.getUTCMonth() - 1,
      1,
    ) - manilaOffsetMilliseconds,
  );

  const users = adminDb.collection(
    USERS_COLLECTION,
  );

  const providersCollection =
    adminDb.collection(
      PROVIDERS_COLLECTION,
    );

  const [
    customerCount,
    providerCount,
    restrictedCustomerCount,
    restrictedProviderCount,
    customerThisMonthCount,
    providerThisMonthCount,
    customerLastMonthCount,
    providerLastMonthCount,
    verifiedProviderCount,
    pendingProviderCount,
  ] = await Promise.all([
    users
      .where("role", "==", "customer")
      .count()
      .get(),

    users
      .where("role", "==", "provider")
      .count()
      .get(),

    users
      .where("role", "==", "customer")
      .where(
        "accountStatus",
        "in",
        ["blocked", "disabled"],
      )
      .count()
      .get(),

    users
      .where("role", "==", "provider")
      .where(
        "accountStatus",
        "in",
        ["blocked", "disabled"],
      )
      .count()
      .get(),

    users
      .where("role", "==", "customer")
      .where(
        "createdAt",
        ">=",
        Timestamp.fromDate(
          thisMonthStart,
        ),
      )
      .where(
        "createdAt",
        "<",
        Timestamp.fromDate(
          nextMonthStart,
        ),
      )
      .count()
      .get(),

    users
      .where("role", "==", "provider")
      .where(
        "createdAt",
        ">=",
        Timestamp.fromDate(
          thisMonthStart,
        ),
      )
      .where(
        "createdAt",
        "<",
        Timestamp.fromDate(
          nextMonthStart,
        ),
      )
      .count()
      .get(),

    users
      .where("role", "==", "customer")
      .where(
        "createdAt",
        ">=",
        Timestamp.fromDate(
          previousMonthStart,
        ),
      )
      .where(
        "createdAt",
        "<",
        Timestamp.fromDate(
          thisMonthStart,
        ),
      )
      .count()
      .get(),

    users
      .where("role", "==", "provider")
      .where(
        "createdAt",
        ">=",
        Timestamp.fromDate(
          previousMonthStart,
        ),
      )
      .where(
        "createdAt",
        "<",
        Timestamp.fromDate(
          thisMonthStart,
        ),
      )
      .count()
      .get(),

    providersCollection
      .where(
        "verificationStatus",
        "==",
        "approved",
      )
      .count()
      .get(),

    providersCollection
      .where(
        "verificationStatus",
        "in",
        [
          "draft",
          "submitted",
          "under_review",
          "resubmission_required",
        ],
      )
      .count()
      .get(),
  ]);

  const customers =
    customerCount.data().count;

  const providers =
    providerCount.data().count;

  const registeredThisMonth =
    customerThisMonthCount.data().count +
    providerThisMonthCount.data().count;

  const registeredLastMonth =
    customerLastMonthCount.data().count +
    providerLastMonthCount.data().count;

  return {
    totalAccounts:
      customers + providers,

    customers,
    providers,

    verifiedProviders:
      verifiedProviderCount.data().count,

    pendingProviders:
      pendingProviderCount.data().count,

    restrictedAccounts:
      restrictedCustomerCount.data().count +
      restrictedProviderCount.data().count,

    registeredThisMonth,
    registeredLastMonth,

    accountGrowthPercentage:
      calculateAccountGrowth(
        registeredThisMonth,
        registeredLastMonth,
      ),
  };
}

function getAdminUserStatistics(): Promise<
  AdminUserStatistics
> {
  const now = Date.now();

  if (
    userStatisticsCache &&
    userStatisticsCache.expiresAt > now
  ) {
    return userStatisticsCache.promise;
  }

  const promise =
    queryAdminUserStatistics();

  userStatisticsCache = {
    expiresAt:
      now + USER_STATISTICS_CACHE_MS,

    promise,
  };

  void promise.catch(() => {
    if (
      userStatisticsCache?.promise ===
      promise
    ) {
      userStatisticsCache = null;
    }
  });

  return promise;
}

export async function getAdminUserPage(
  input: AdminUserFilters,
): Promise<AdminUserPage> {
  await requireAdmin();

  const filters = normalizeFilters(input);
  const statisticsPromise =
    getAdminUserStatistics();

  let query: Query<DocumentData> = adminDb.collection(
    USERS_COLLECTION,
  );

  query = applyUserFilters(query, filters);

  query = query
    .orderBy("createdAt", "desc")
    .orderBy(FieldPath.documentId(), "desc");

  /*
   * Search intentionally matches the current Flutter
   * behavior: retrieve all filtered users, attach provider
   * information, and search in memory.
   *
   * Replace this with normalized search terms or an
   * external search service before the collection becomes
   * large.
   */
  if (filters.search.length >= 2) {
    const snapshot = await query.get();

    let users = snapshot.docs
      .map(mapUserDocument)
      .filter(
        (user): user is AdminUser => user !== null,
      );

    users = await attachProviderInformation(users);

    users = users.filter((user) =>
      matchesSearch(user, filters.search),
    );

    return {
      users,
      statistics: await statisticsPromise,
      nextCursor: null,
      hasMore: false,
    };
  }

  if (
    filters.search.length > 0 &&
    filters.search.length < 2
  ) {
    return {
      users: [],
      statistics: await statisticsPromise,
      nextCursor: null,
      hasMore: false,
    };
  }

  const cursor = decodeCursor(filters.cursor);

  if (cursor) {
    query = query.startAfter(
      Timestamp.fromMillis(
        cursor.createdAtMilliseconds,
      ),
      cursor.documentId,
    );
  }

  const snapshot = await query
    .limit(filters.pageSize + 1)
    .get();

  const hasMore =
    snapshot.docs.length > filters.pageSize;

  const visibleDocuments = hasMore
    ? snapshot.docs.slice(0, filters.pageSize)
    : snapshot.docs;

  let users = visibleDocuments
    .map(mapUserDocument)
    .filter(
      (user): user is AdminUser => user !== null,
    );

  users = await attachProviderInformation(users);

  const lastDocument =
    visibleDocuments.at(-1) ?? null;

  return {
    users,
    statistics: await statisticsPromise,
    nextCursor:
      hasMore && lastDocument
        ? encodeCursor(lastDocument)
        : null,
    hasMore,
  };
}

export async function getAdminUserDetails(
  userId: string,
): Promise<AdminUserDetailsResult> {
  await requireAdmin();

  const normalizedUserId = userId.trim();

  if (
    !/^[A-Za-z0-9_-]{1,150}$/u.test(
      normalizedUserId,
    )
  ) {
    throw new Error(
      "A valid user ID is required.",
    );
  }

  const userSnapshot = await adminDb
    .collection(USERS_COLLECTION)
    .doc(normalizedUserId)
    .get();

  if (!userSnapshot.exists) {
    throw new Error(
      "The user account no longer exists.",
    );
  }

  const userData = userSnapshot.data() ?? {};
  const role = normalizeRole(userData.role);

  if (!role) {
    throw new Error(
      "This account cannot be reviewed from User Management.",
    );
  }

  let providerId: string | null = null;
  let verificationId: string | null = null;

  if (role === "provider") {
    const providerSnapshot = await adminDb
      .collection(PROVIDERS_COLLECTION)
      .where(
        "ownerId",
        "==",
        normalizedUserId,
      )
      .limit(1)
      .get();

    providerId =
      providerSnapshot.docs.at(0)?.id ??
      null;

    if (providerId) {
      const verificationSnapshot =
        await adminDb
          .collection(
            PROVIDER_VERIFICATIONS_COLLECTION,
          )
          .where(
            "providerId",
            "==",
            providerId,
          )
          .limit(1)
          .get();

      verificationId =
        verificationSnapshot.docs.at(0)?.id ??
        null;
    }
  }

  const [
    bookings,
    activity,
    documents,
  ] = await Promise.all([
    loadAdminUserBookings({
      userId: normalizedUserId,
      role,
      providerId,
    }),
    loadAdminUserActivity({
      userId: normalizedUserId,
      providerId,
      verificationId,
    }),
    loadAdminUserVerificationDocuments(
      verificationId,
    ),
  ]);

  return {
    details: {
      userId: normalizedUserId,
      role,
      bookings,
      activity,
      documents,
      limits: {
        bookings:
          USER_DETAIL_BOOKING_LIMIT,
        activity:
          USER_DETAIL_ACTIVITY_LIMIT,
      },
    },
  };
}

async function loadAdminUserBookings({
  userId,
  role,
  providerId,
}: {
  userId: string;
  role: AdminUser["role"];
  providerId: string | null;
}): Promise<AdminUserBookingSummary[]> {
  if (role === "customer") {
    const snapshot = await adminDb
      .collection(MAIN_EVENTS_COLLECTION)
      .where("customerId", "==", userId)
      .orderBy("createdAt", "desc")
      .limit(USER_DETAIL_BOOKING_LIMIT)
      .get();

    return snapshot.docs.map((document) => {
      const data = document.data();

      return {
        id: document.id,
        reference:
          nullableString(data.bookingCode) ??
          nullableString(data.reference) ??
          document.id,
        relationship: "customer",
        eventType:
          stringValue(data.eventType) ||
          "Event",
        eventDate:
          isoDateValue(data.eventDate),
        city: stringValue(data.city),
        bookingStatus:
          stringValue(data.status) ||
          "unknown",
        paymentStatus:
          nullableString(
            data.paymentStatus,
          ),
        providerRequestStatus: null,
        createdAt:
          isoDateValue(data.createdAt),
      };
    });
  }

  if (!providerId) {
    return [];
  }

  const requestSnapshot = await adminDb
    .collection(PROVIDER_REQUESTS_COLLECTION)
    .where("providerId", "==", providerId)
    .orderBy("createdAt", "desc")
    .limit(USER_DETAIL_BOOKING_LIMIT)
    .get();

  if (requestSnapshot.empty) {
    return [];
  }

  const eventIds = [
    ...new Set(
      requestSnapshot.docs
        .map((document) =>
          stringValue(
            document.data().mainEventId,
          ),
        )
        .filter(Boolean),
    ),
  ];

  const eventSnapshots =
    eventIds.length > 0
      ? await adminDb.getAll(
          ...eventIds.map((eventId) =>
            adminDb
              .collection(
                MAIN_EVENTS_COLLECTION,
              )
              .doc(eventId),
          ),
        )
      : [];

  const eventById = new Map(
    eventSnapshots.map((snapshot) => [
      snapshot.id,
      snapshot,
    ]),
  );

  return requestSnapshot.docs.map(
    (requestDocument) => {
      const requestData =
        requestDocument.data();

      const mainEventId = stringValue(
        requestData.mainEventId,
      );

      const eventSnapshot =
        eventById.get(mainEventId);

      const eventData =
        eventSnapshot?.data() ?? {};

      return {
        id:
          mainEventId ||
          requestDocument.id,
        reference:
          nullableString(
            eventData.bookingCode,
          ) ??
          nullableString(
            eventData.reference,
          ) ??
          mainEventId ??
          requestDocument.id,
        relationship: "provider",
        eventType:
          stringValue(
            eventData.eventType,
          ) ||
          stringValue(
            requestData.requestType,
          ) ||
          "Event",
        eventDate:
          isoDateValue(
            eventData.eventDate,
          ),
        city:
          stringValue(eventData.city),
        bookingStatus:
          stringValue(
            eventData.status,
          ) || "unknown",
        paymentStatus:
          nullableString(
            requestData.paymentStatus,
          ) ??
          nullableString(
            eventData.paymentStatus,
          ),
        providerRequestStatus:
          nullableString(
            requestData.status,
          ),
        createdAt:
          isoDateValue(
            requestData.createdAt,
          ),
      };
    },
  );
}

async function loadAdminUserActivity({
  userId,
  providerId,
  verificationId,
}: {
  userId: string;
  providerId: string | null;
  verificationId: string | null;
}): Promise<AdminUserActivityEntry[]> {
  const targetIds = [
    ...new Set(
      [
        userId,
        providerId,
        verificationId,
      ].filter(
        (value): value is string =>
          Boolean(value),
      ),
    ),
  ];

  let query = adminDb
    .collection(ADMIN_LOGS_COLLECTION)
    .orderBy("createdAt", "desc")
    .limit(USER_DETAIL_ACTIVITY_LIMIT);

  if (targetIds.length === 1) {
    query = query.where(
      "targetId",
      "==",
      targetIds[0],
    );
  } else {
    query = query.where(
      "targetId",
      "in",
      targetIds,
    );
  }

  const snapshot = await query.get();

  return snapshot.docs.map((document) => {
    const data = document.data();

    return {
      id: document.id,
      action:
        stringValue(data.action) ||
        "administrative_activity",
      actorId:
        stringValue(data.actorId),
      actorRole:
        stringValue(data.actorRole) ||
        "system",
      targetCollection:
        stringValue(
          data.targetCollection,
        ),
      targetId:
        stringValue(data.targetId),
      reason:
        nullableString(data.reason),
      source:
        nullableString(data.source),
      createdAt:
        isoDateValue(data.createdAt),
    };
  });
}

async function loadAdminUserVerificationDocuments(
  verificationId: string | null,
): Promise<
  AdminUserVerificationDocument[]
> {
  if (!verificationId) {
    return [];
  }

  const snapshot = await adminDb
    .collection(
      PROVIDER_VERIFICATIONS_COLLECTION,
    )
    .doc(verificationId)
    .collection("documents")
    .limit(USER_DETAIL_DOCUMENT_LIMIT)
    .get();

  return snapshot.docs
    .map((document) => {
    const data = document.data();

    const documentType =
      stringValue(data.documentType) ||
      document.id ||
      "verification_document";

    const encodedVerificationId =
      encodeURIComponent(verificationId);

    const encodedDocumentId =
      encodeURIComponent(document.id);

    const basePath =
      `/api/admin/provider-verifications/${encodedVerificationId}` +
      `/documents/${encodedDocumentId}`;

    return {
      id: document.id,
      verificationId,
      documentType,
      title:
        nullableString(data.title) ??
        humanizeAdminUserValue(
          documentType,
        ),
      fileName:
        nullableString(
          data.originalFileName,
        ) ??
        nullableString(data.fileName) ??
        humanizeAdminUserValue(
          documentType,
        ),
      fileSize:
        formatAdminUserFileSize(
          data.fileSizeBytes ??
            data.size,
        ),
      contentType:
        nullableString(
          data.contentType,
        ) ??
        nullableString(data.mimeType) ??
        "application/octet-stream",
      status:
        stringValue(data.status) ||
        "pending",
      isRequired:
        booleanValue(
          data.isRequired,
        ),
      uploadedAt:
        isoDateValue(
          data.uploadedAt ??
            data.createdAt,
        ),
      reviewedAt:
        isoDateValue(
          data.reviewedAt ??
            data.verifiedAt ??
              data.updatedAt,
        ),

      viewPath: basePath,
      downloadPath:
        `${basePath}?disposition=attachment`,
    };
  })
  .sort((left, right) => {
    const leftTime = left.uploadedAt
      ? Date.parse(left.uploadedAt)
      : 0;

    const rightTime = right.uploadedAt
      ? Date.parse(right.uploadedAt)
      : 0;

    return rightTime - leftTime;
  });
}

function humanizeAdminUserValue(
  value: string,
): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) =>
      character.toUpperCase(),
    );
}

function formatAdminUserFileSize(
  value: unknown,
): string {
  const bytes =
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
      ? value
      : 0;

  if (bytes === 0) {
    return "Size unavailable";
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(1)} MB`;
}

async function loadMutableUser(userId: string) {
  const normalizedUserId = userId.trim();

  if (!normalizedUserId) {
    throw new Error("The user ID is required.");
  }

  const reference = adminDb
    .collection(USERS_COLLECTION)
    .doc(normalizedUserId);

  const snapshot = await reference.get();

  if (!snapshot.exists) {
    throw new Error(
      "The user account no longer exists.",
    );
  }

  const data = snapshot.data() ?? {};
  const role = normalizeRole(data.role);

  if (!role) {
    throw new Error(
      "This account cannot be modified from User Management.",
    );
  }

  return {
    id: normalizedUserId,
    role,
    reference,
    data,
    fullName: createFullName(
      stringValue(data.firstName),
      stringValue(data.lastName),
    ),
  };
}

async function loadProviderDocuments(
  ownerId: string,
) {
  const snapshot = await adminDb
    .collection(PROVIDERS_COLLECTION)
    .where("ownerId", "==", ownerId)
    .get();

  if (snapshot.empty) {
    throw new Error(
      "The provider record no longer exists.",
    );
  }

  if (
    snapshot.docs.length > MAX_PROVIDER_WRITES
  ) {
    throw new Error(
      "Too many duplicate provider records were found. Clean up the provider data before modifying this account.",
    );
  }

  return snapshot.docs;
}

function preferredProviderVerificationStatus(
  documents: QueryDocumentSnapshot<DocumentData>[],
) {
  let selectedStatus:
    | AdminVerificationStatus
    | null = null;

  for (const document of documents) {
    const status = normalizeVerificationStatus(
      document.data().verificationStatus,
    );

    if (
      !selectedStatus ||
      verificationPriority(status) >
        verificationPriority(selectedStatus)
    ) {
      selectedStatus = status;
    }
  }

  return selectedStatus ?? "pending";
}

function normalizeAccessText(
  value: string,
  field: string,
  minimumLength: number,
  maximumLength: number,
): string {
  const normalized = value
    .trim()
    .replace(/\s+/g, " ");

  if (
    normalized.length < minimumLength ||
    normalized.length > maximumLength
  ) {
    throw new Error(
      `${field} must contain between ${minimumLength} and ${maximumLength} characters.`,
    );
  }

  return normalized;
}

function accessDecisionState(
  decision:
    ManageAdminAccountAccessInput["decision"],
): {
  isActive: boolean;
  isBlocked: boolean;
  accountStatus: AdminAccountStatus;
  authenticationDisabled: boolean;
} {
  switch (decision) {
    case "disable":
      return {
        isActive: false,
        isBlocked: false,
        accountStatus: "disabled",
        authenticationDisabled: true,
      };

    case "block":
      return {
        isActive: false,
        isBlocked: true,
        accountStatus: "blocked",
        authenticationDisabled: true,
      };

    case "restore":
      return {
        isActive: true,
        isBlocked: false,
        accountStatus: "active",
        authenticationDisabled: false,
      };

    default:
      throw new Error(
        "The requested account access decision is invalid.",
      );
  }
}

function accessNotificationContent(
  decision:
    ManageAdminAccountAccessInput["decision"],
  userExplanation: string,
): {
  title: string;
  message: string;
} {
  switch (decision) {
    case "disable":
      return {
        title: "Account access disabled",
        message: userExplanation,
      };

    case "block":
      return {
        title: "Account access restricted",
        message: userExplanation,
      };

    case "restore":
      return {
        title: "Account access restored",
        message: userExplanation,
      };
  }
}


export async function manageAdminUserAccountAccess(
  input: ManageAdminAccountAccessInput,
): Promise<ManageAdminAccountAccessResult> {
  const administrator = await requireAdmin();

  const userId = stringValue(
    input.userId,
  );

  if (
    userId.length < 1 ||
    userId.length > 128
  ) {
    throw new Error(
      "The selected account identifier is invalid.",
    );
  }

  if (userId === administrator.uid) {
    throw new Error(
      "Administrators cannot change their own account access.",
    );
  }

  const userExplanation =
    normalizeAccessText(
      input.userExplanation,
      "The user explanation",
      10,
      500,
    );

  const internalReason =
    normalizeAccessText(
      input.internalReason,
      "The internal administrative reason",
      10,
      1000,
    );

  const user = await loadMutableUser(
    userId,
  );

  const currentIsActive =
    booleanValue(
      user.data.isActive,
      true,
    );

  const currentIsBlocked =
    booleanValue(
      user.data.isBlocked,
    );

  const target =
    accessDecisionState(
      input.decision,
    );

  const changed =
    currentIsActive !==
      target.isActive ||
    currentIsBlocked !==
      target.isBlocked;

  /*
   * Synchronize Firebase Authentication even when the
   * Firestore state is already correct. This repairs a
   * possible earlier partial operation without creating
   * another audit entry.
   */
 

  if (!changed) {
    await adminAuth.updateUser(
      user.id,
      {
        disabled:
          target.authenticationDisabled,
      },
    );

    if (
      target.authenticationDisabled
    ) {
      await adminAuth.revokeRefreshTokens(
        user.id,
      );
    }

    return {
      userId: user.id,
      accountStatus:
        target.accountStatus,
      changed: false,
    };
  }

  const providerDocuments =
    user.role === "provider"
      ? await loadProviderDocuments(
          user.id,
        )
      : [];

  const customerReference =
    adminDb
      .collection(
        CUSTOMERS_COLLECTION,
      )
      .doc(user.id);

  if (
    user.role === "customer"
  ) {
    const customerSnapshot =
      await customerReference.get();

    if (!customerSnapshot.exists) {
      throw new Error(
        "The customer profile no longer exists.",
      );
    }
  }

  const verificationStatus =
    user.role === "provider"
      ? preferredProviderVerificationStatus(
          providerDocuments,
        )
      : null;

  const providerIsActive =
    target.isActive &&
    !target.isBlocked &&
    verificationStatus ===
      "verified";

    await adminAuth.updateUser(
      user.id,
      {
        disabled:
          target.authenticationDisabled,
      },
    );

    if (
      target.authenticationDisabled
    ) {
      await adminAuth.revokeRefreshTokens(
        user.id,
      );
    }

  const notification =
    accessNotificationContent(
      input.decision,
      userExplanation,
    );

  const timestamp =
    FieldValue.serverTimestamp();

  const batch = adminDb.batch();

  batch.update(
    user.reference,
    {
      isActive: target.isActive,
      isBlocked:
        target.isBlocked,
      accountStatus:
        target.accountStatus,
      updatedAt: timestamp,
    },
  );

  if (
    user.role === "customer"
  ) {
    batch.update(
      customerReference,
      {
        isActive:
          target.isActive,
        isBlocked:
          target.isBlocked,
        updatedAt: timestamp,
      },
    );
  }

  for (
    const providerDocument
    of providerDocuments
  ) {
    batch.update(
      providerDocument.ref,
      {
        isActive:
          providerIsActive,
        isBlocked:
          target.isBlocked,
        updatedAt: timestamp,
      },
    );
  }

  batch.create(
    adminDb
      .collection(
        NOTIFICATIONS_COLLECTION,
      )
      .doc(),
    {
      userId: user.id,
      title:
        notification.title,
      message:
        notification.message,
      type: "account",
      relatedId: user.id,
      relatedCollection:
        USERS_COLLECTION,
      isRead: false,
      readAt: null,
      createdAt: timestamp,
    },
  );

  batch.create(
    adminDb
      .collection(
        ADMIN_LOGS_COLLECTION,
      )
      .doc(),
    {
      actorId:
        administrator.uid,
      actorRole: "admin",

      action:
        input.decision ===
          "restore"
          ? "user_account_access_restored"
          : input.decision ===
              "block"
            ? "user_account_blocked"
            : "user_account_disabled",

      description:
        input.decision ===
          "restore"
          ? `Restored access to ${user.fullName}'s account.`
          : input.decision ===
              "block"
            ? `Blocked ${user.fullName}'s account.`
            : `Disabled ${user.fullName}'s account.`,

      targetCollection:
        USERS_COLLECTION,
      targetId: user.id,

      reason:
        internalReason,

      source:
        "admin_user_management",

      before: {
        isActive:
          currentIsActive,
        isBlocked:
          currentIsBlocked,
        accountStatus:
          resolveAccountStatus(
            currentIsActive,
            currentIsBlocked,
          ),
      },

      after: {
        isActive:
          target.isActive,
        isBlocked:
          target.isBlocked,
        accountStatus:
          target.accountStatus,
      },

      metadata: {
        decision:
          input.decision,
        userExplanation,
        role: user.role,
      },

      createdAt: timestamp,
    },
  );

  await batch.commit();

  invalidateUserStatisticsCache();

  return {
    userId: user.id,
    accountStatus:
      target.accountStatus,
    changed: true,
  };
}