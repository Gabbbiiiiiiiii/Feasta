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
  type AdminUserFilters,
  type AdminUserPage,
  type AdminUserStatistics,
  type AdminVerificationStatus,
} from "@/lib/admin/users/admin-user-types";
import { requireAdmin } from "@/lib/auth/session";
import { adminDb } from "@/lib/firebase/admin";

const USERS_COLLECTION = "users";
const CUSTOMERS_COLLECTION = "customers";
const PROVIDERS_COLLECTION = "providers";
const ADMIN_LOGS_COLLECTION = "adminLogs";

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

type UpdateAccountStatusInput = {
  userId: string;
  isActive: boolean;
};

type UpdateBlockedStatusInput = {
  userId: string;
  isBlocked: boolean;
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
    filteredQuery = filteredQuery.where(
      "isActive",
      "==",
      false,
    );
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

async function getAdminUserStatistics(): Promise<AdminUserStatistics> {
  const [usersSnapshot, providersSnapshot] =
    await Promise.all([
      adminDb
        .collection(USERS_COLLECTION)
        .where("role", "in", [
          "customer",
          "provider",
        ])
        .get(),

      adminDb
        .collection(PROVIDERS_COLLECTION)
        .select("ownerId", "verificationStatus")
        .get(),
    ]);

  const providerUserIds = new Set<string>();

  let customers = 0;
  let providers = 0;
  let restrictedAccounts = 0;
  let registeredThisMonth = 0;
  let registeredLastMonth = 0;

  const now = new Date();

  const startOfThisMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  );

  const startOfNextMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    1,
  );

  const startOfLastMonth = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    1,
  );

  for (const document of usersSnapshot.docs) {
    const data = document.data();
    const role = normalizeRole(data.role);

    if (!role) {
      continue;
    }

    if (role === "customer") {
      customers += 1;
    } else {
      providers += 1;
      providerUserIds.add(document.id);
    }

    const isActive = booleanValue(
      data.isActive,
      true,
    );

    const isBlocked = booleanValue(data.isBlocked);

    if (!isActive || isBlocked) {
      restrictedAccounts += 1;
    }

    const createdAt = dateValue(data.createdAt);

    if (
      createdAt &&
      createdAt >= startOfThisMonth &&
      createdAt < startOfNextMonth
    ) {
      registeredThisMonth += 1;
    } else if (
      createdAt &&
      createdAt >= startOfLastMonth &&
      createdAt < startOfThisMonth
    ) {
      registeredLastMonth += 1;
    }
  }

  const providerStatusByOwnerId =
    new Map<string, AdminVerificationStatus>();

  for (const document of providersSnapshot.docs) {
    const data = document.data();
    const ownerId = stringValue(data.ownerId);

    if (
      !ownerId ||
      !providerUserIds.has(ownerId)
    ) {
      continue;
    }

    const candidateStatus =
      normalizeVerificationStatus(
        data.verificationStatus,
      );

    const currentStatus =
      providerStatusByOwnerId.get(ownerId);

    if (
      !currentStatus ||
      verificationPriority(candidateStatus) >
        verificationPriority(currentStatus)
    ) {
      providerStatusByOwnerId.set(
        ownerId,
        candidateStatus,
      );
    }
  }

  let verifiedProviders = 0;
  let pendingProviders = 0;

  for (const status of providerStatusByOwnerId.values()) {
    if (status === "verified") {
      verifiedProviders += 1;
    } else if (status === "pending") {
      pendingProviders += 1;
    }
  }

  return {
    totalAccounts: customers + providers,
    customers,
    providers,
    verifiedProviders,
    pendingProviders,
    restrictedAccounts,
    registeredThisMonth,
    registeredLastMonth,
    accountGrowthPercentage:
      calculateAccountGrowth(
        registeredThisMonth,
        registeredLastMonth,
      ),
  };
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

export async function updateAdminUserAccountStatus({
  userId,
  isActive,
}: UpdateAccountStatusInput): Promise<void> {
  const administrator = await requireAdmin();
  const user = await loadMutableUser(userId);

  const isBlocked = booleanValue(
    user.data.isBlocked,
  );

  const providerDocuments =
    user.role === "provider"
      ? await loadProviderDocuments(user.id)
      : [];

  if (user.role === "customer") {
    const customerSnapshot = await adminDb
      .collection(CUSTOMERS_COLLECTION)
      .doc(user.id)
      .get();

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

  const canActivateProvider =
    isActive &&
    !isBlocked &&
    verificationStatus === "verified";

  const batch = adminDb.batch();
  const timestamp = FieldValue.serverTimestamp();

  batch.update(user.reference, {
    isActive,
    updatedAt: timestamp,
  });

  if (user.role === "customer") {
    batch.update(
      adminDb
        .collection(CUSTOMERS_COLLECTION)
        .doc(user.id),
      {
        isActive,
        updatedAt: timestamp,
      },
    );
  }

  for (const providerDocument of providerDocuments) {
    batch.update(providerDocument.ref, {
      isActive: canActivateProvider,
      updatedAt: timestamp,
    });
  }

  batch.create(
    adminDb.collection(ADMIN_LOGS_COLLECTION).doc(),
    {
      actorId: administrator.uid,
      actorRole: "admin",
      action: isActive
        ? "user_account_enabled"
        : "user_account_disabled",
      description: isActive
        ? `Enabled ${user.fullName} account.`
        : `Disabled ${user.fullName} account.`,
      targetCollection: USERS_COLLECTION,
      targetId: user.id,
      createdAt: timestamp,
    },
  );

  await batch.commit();
}

export async function updateAdminUserBlockedStatus({
  userId,
  isBlocked,
}: UpdateBlockedStatusInput): Promise<void> {
  const administrator = await requireAdmin();
  const user = await loadMutableUser(userId);

  const isActive = booleanValue(
    user.data.isActive,
    true,
  );

  const providerDocuments =
    user.role === "provider"
      ? await loadProviderDocuments(user.id)
      : [];

  if (user.role === "customer") {
    const customerSnapshot = await adminDb
      .collection(CUSTOMERS_COLLECTION)
      .doc(user.id)
      .get();

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

  const canActivateProvider =
    !isBlocked &&
    isActive &&
    verificationStatus === "verified";

  const batch = adminDb.batch();
  const timestamp = FieldValue.serverTimestamp();

  batch.update(user.reference, {
    isBlocked,
    updatedAt: timestamp,
  });

  if (user.role === "customer") {
    batch.update(
      adminDb
        .collection(CUSTOMERS_COLLECTION)
        .doc(user.id),
      {
        isBlocked,
        updatedAt: timestamp,
      },
    );
  }

  for (const providerDocument of providerDocuments) {
    batch.update(providerDocument.ref, {
      isBlocked,
      isActive: canActivateProvider,
      updatedAt: timestamp,
    });
  }

  batch.create(
    adminDb.collection(ADMIN_LOGS_COLLECTION).doc(),
    {
      actorId: administrator.uid,
      actorRole: "admin",
      action: isBlocked
        ? "user_account_blocked"
        : "user_account_unblocked",
      description: isBlocked
        ? `Blocked ${user.fullName} account.`
        : `Unblocked ${user.fullName} account.`,
      targetCollection: USERS_COLLECTION,
      targetId: user.id,
      createdAt: timestamp,
    },
  );

  await batch.commit();
}