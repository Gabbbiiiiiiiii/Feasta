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
  COMPLAINT_PRIORITIES,
  COMPLAINT_STATUSES,
  type ComplaintPriority,
  type ComplaintStatus,
} from "@feasta/shared-types";

import type {
  AdminComplaint,
  AdminComplaintDecision,
  AdminComplaintFilters,
  AdminComplaintPage,
  AdminComplaintStatistics,
  ManageAdminComplaintInput,
  ManageAdminComplaintResult,
} from "@/lib/admin/complaints/admin-complaint-types";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const COMPLAINTS_COLLECTION = "complaints";
const PROVIDERS_COLLECTION = "providers";
const ADMIN_LOGS_COLLECTION = "adminLogs";
const NOTIFICATIONS_COLLECTION = "notifications";
const USERS_COLLECTION = "users";

const DEFAULT_PAGE_SIZE = 10;
const ALLOWED_PAGE_SIZES = [10, 20, 50];
const SEARCH_SCAN_LIMIT = 200;

type ComplaintCursor = {
  createdAtMilliseconds: number;
  documentId: string;
};

const SAFE_DOCUMENT_ID =
  /^[A-Za-z0-9_-]{1,150}$/u;

const complaintStatuses =
  new Set<string>(COMPLAINT_STATUSES);

const complaintPriorities =
  new Set<string>(COMPLAINT_PRIORITIES);

const decisionStatus: Record<
  AdminComplaintDecision,
  ComplaintStatus
> = {
  start_review: "under_review",
  request_customer_response:
    "awaiting_customer",
  request_provider_response:
    "awaiting_provider",
  escalate: "escalated",
  resolve: "resolved",
  dismiss: "dismissed",
  close: "closed",
  reopen: "under_review",
};

const permittedTransitions: Record<
  ComplaintStatus,
  readonly ComplaintStatus[]
> = {
  submitted: [
    "under_review",
    "escalated",
    "dismissed",
  ],
  under_review: [
    "awaiting_customer",
    "awaiting_provider",
    "resolved",
    "dismissed",
    "escalated",
  ],
  awaiting_customer: [
    "under_review",
    "resolved",
    "dismissed",
    "escalated",
  ],
  awaiting_provider: [
    "under_review",
    "resolved",
    "dismissed",
    "escalated",
  ],
  escalated: [
    "under_review",
    "awaiting_customer",
    "awaiting_provider",
    "resolved",
    "dismissed",
  ],
  resolved: [
    "closed",
    "under_review",
  ],
  dismissed: [
    "closed",
    "under_review",
  ],
  closed: [
    "under_review",
  ],
};

export async function getAdminComplaintPage(
  input: AdminComplaintFilters,
): Promise<AdminComplaintPage> {
  await requireAdmin();

  const filters =
    normalizeComplaintFilters(input);

  const statisticsPromise =
    getAdminComplaintStatistics();

  if (filters.search) {
    const complaints =
      await searchAdminComplaints(
        filters,
      );

    const visibleComplaints =
      complaints.slice(
        0,
        filters.pageSize,
      );

    return {
      complaints:
        visibleComplaints,
      statistics:
        await statisticsPromise,
      nextCursor: null,
      hasMore:
        complaints.length >
        filters.pageSize,
    };
  }

  let query: Query<DocumentData> =
    adminDb
      .collection(
        COMPLAINTS_COLLECTION,
      )
      .where(
        "isDeleted",
        "==",
        false,
      );

  query = applyComplaintFilters(
    query,
    filters,
  );

  query = query
    .orderBy(
      "createdAt",
      "desc",
    )
    .orderBy(
      FieldPath.documentId(),
      "desc",
    );

  const cursor =
    decodeComplaintCursor(
      filters.cursor,
    );

  if (cursor) {
    query = query.startAfter(
      Timestamp.fromMillis(
        cursor.createdAtMilliseconds,
      ),
      cursor.documentId,
    );
  }

  const snapshot = await query
    .limit(
      filters.pageSize + 1,
    )
    .get();

  const hasMore =
    snapshot.docs.length >
    filters.pageSize;

  const visibleDocuments =
    hasMore
      ? snapshot.docs.slice(
          0,
          filters.pageSize,
        )
      : snapshot.docs;

  const complaints =
    await hydrateComplaintIdentities(
      visibleDocuments
        .map(
          mapComplaintDocument,
        )
        .filter(
          (
            complaint,
          ): complaint is AdminComplaint =>
            complaint !== null,
        ),
    );

  const lastDocument =
    visibleDocuments.at(-1) ??
    null;

  return {
    complaints,
    statistics:
      await statisticsPromise,
    nextCursor:
      hasMore && lastDocument
        ? encodeComplaintCursor(
            lastDocument,
          )
        : null,
    hasMore,
  };
}

async function getAdminComplaintStatistics(): Promise<
  AdminComplaintStatistics
> {
  const complaints =
    adminDb
      .collection(
        COMPLAINTS_COLLECTION,
      )
      .where(
        "isDeleted",
        "==",
        false,
      );

  const [
    totalSnapshot,
    submittedSnapshot,
    underReviewSnapshot,
    awaitingSnapshot,
    escalatedSnapshot,
    resolvedSnapshot,
    dismissedSnapshot,
    closedSnapshot,
  ] = await Promise.all([
    complaints.count().get(),

    complaints
      .where(
        "status",
        "==",
        "submitted",
      )
      .count()
      .get(),

    complaints
      .where(
        "status",
        "==",
        "under_review",
      )
      .count()
      .get(),

    complaints
      .where(
        "status",
        "in",
        [
          "awaiting_customer",
          "awaiting_provider",
        ],
      )
      .count()
      .get(),

    complaints
      .where(
        "status",
        "==",
        "escalated",
      )
      .count()
      .get(),

    complaints
      .where(
        "status",
        "==",
        "resolved",
      )
      .count()
      .get(),

    complaints
      .where(
        "status",
        "==",
        "dismissed",
      )
      .count()
      .get(),

    complaints
      .where(
        "status",
        "==",
        "closed",
      )
      .count()
      .get(),
  ]);

  return {
    totalComplaints:
      totalSnapshot.data().count,
    submitted:
      submittedSnapshot.data().count,
    underReview:
      underReviewSnapshot
        .data()
        .count,
    awaitingResponse:
      awaitingSnapshot.data().count,
    escalated:
      escalatedSnapshot.data().count,
    resolved:
      resolvedSnapshot.data().count,
    dismissed:
      dismissedSnapshot.data().count,
    closed:
      closedSnapshot.data().count,
  };
}

async function searchAdminComplaints(
  filters: ReturnType<
    typeof normalizeComplaintFilters
  >,
): Promise<AdminComplaint[]> {
  let query: Query<DocumentData> =
    adminDb
      .collection(
        COMPLAINTS_COLLECTION,
      )
      .where(
        "isDeleted",
        "==",
        false,
      );

  if (filters.status !== "all") {
    query = query.where(
      "status",
      "==",
      filters.status,
    );
  }

  const snapshot = await query
    .orderBy(
      "createdAt",
      "desc",
    )
    .limit(SEARCH_SCAN_LIMIT)
    .get();

  const complaints =
    await hydrateComplaintIdentities(
      snapshot.docs
        .map(
          mapComplaintDocument,
        )
        .filter(
          (
            complaint,
          ): complaint is AdminComplaint =>
            complaint !== null,
        ),
    );

  return complaints.filter(
    (complaint) => {
      if (
        filters.priority !==
          "all" &&
        complaint.priority !==
          filters.priority
      ) {
        return false;
      }

      return complaintMatchesSearch(
        complaint,
        filters.search,
      );
    },
  );
}

function applyComplaintFilters(
  query: Query<DocumentData>,
  filters: ReturnType<
    typeof normalizeComplaintFilters
  >,
) {
  let filteredQuery = query;

  if (filters.status !== "all") {
    filteredQuery =
      filteredQuery.where(
        "status",
        "==",
        filters.status,
      );
  }

  if (filters.priority !== "all") {
    filteredQuery =
      filteredQuery.where(
        "priority",
        "==",
        filters.priority,
      );
  }

  return filteredQuery;
}

function mapComplaintDocument(
  document: QueryDocumentSnapshot<DocumentData>,
): AdminComplaint | null {
  const data = document.data();
  const userId =
    stringValue(data.userId);

  if (
    !SAFE_DOCUMENT_ID.test(
      userId,
    )
  ) {
    return null;
  }

  let status: ComplaintStatus;

  try {
    status =
      normalizeStoredStatus(
        data.status,
      );
  } catch {
    return null;
  }

  return {
    id: document.id,

    userId,
    complainantName:
      "Loading account",
    complainantEmail: "",
    complainantRole: null,

    providerId:
      optionalDocumentId(
        data.providerId,
      ),
    providerName: null,
    providerOwnerId: null,

    category:
      stringValue(
        data.category,
      ) || "general",
    description:
      stringValue(
        data.description,
      ),
    evidenceUrls:
      normalizeEvidenceUrls(
        data.evidenceUrls,
      ),

    status,
    priority:
      normalizeStoredPriority(
        data.priority,
      ),

    resolution:
      nullableString(
        data.resolution,
      ),
    resolvedAt:
      isoDateValue(
        data.resolvedAt,
      ),
    resolvedBy:
      optionalDocumentId(
        data.resolvedBy,
      ),

    assignedAdminId:
      optionalDocumentId(
        data.assignedAdminId,
      ),
    assignedAt:
      isoDateValue(
        data.assignedAt,
      ),

    createdAt:
      isoDateValue(
        data.createdAt,
      ),
    updatedAt:
      isoDateValue(
        data.updatedAt,
      ),
  };
}

async function hydrateComplaintIdentities(
  complaints: AdminComplaint[],
): Promise<AdminComplaint[]> {
  if (complaints.length === 0) {
    return [];
  }

  const userIds = [
    ...new Set(
      complaints.map(
        (complaint) =>
          complaint.userId,
      ),
    ),
  ];

  const providerIds = [
    ...new Set(
      complaints
        .map(
          (complaint) =>
            complaint.providerId,
        )
        .filter(
          (
            providerId,
          ): providerId is string =>
            providerId !== null,
        ),
    ),
  ];

  const [
    userSnapshots,
    providerSnapshots,
  ] = await Promise.all([
    adminDb.getAll(
      ...userIds.map((userId) =>
        adminDb
          .collection(
            USERS_COLLECTION,
          )
          .doc(userId),
      ),
    ),

    providerIds.length > 0
      ? adminDb.getAll(
          ...providerIds.map(
            (providerId) =>
              adminDb
                .collection(
                  PROVIDERS_COLLECTION,
                )
                .doc(
                  providerId,
                ),
          ),
        )
      : Promise.resolve([]),
  ]);

  const usersById = new Map(
    userSnapshots.map(
      (snapshot) => [
        snapshot.id,
        snapshot.data() ?? {},
      ],
    ),
  );

  const providersById =
    new Map(
      providerSnapshots.map(
        (snapshot) => [
          snapshot.id,
          snapshot.data() ?? {},
        ],
      ),
    );

  return complaints.map(
    (complaint) => {
      const user =
        usersById.get(
          complaint.userId,
        ) ?? {};

      const provider =
        complaint.providerId
          ? providersById.get(
              complaint.providerId,
            ) ?? {}
          : {};

      return {
        ...complaint,

        complainantName:
          createAccountName(
            user,
          ),
        complainantEmail:
          stringValue(
            user.email,
          ),
        complainantRole:
          nullableString(
            user.role,
          ),

        providerName:
          complaint.providerId
            ? nullableString(
                provider.businessName,
              ) ??
              "Unnamed provider"
            : null,

        providerOwnerId:
          optionalDocumentId(
            provider.ownerId,
          ),
      };
    },
  );
}

export async function manageAdminComplaint(
  input: ManageAdminComplaintInput,
): Promise<ManageAdminComplaintResult> {
  const administrator = await requireAdmin();

  const complaintId = normalizeDocumentId(
    input.complaintId,
    "complaint",
  );

  const decision = normalizeDecision(
    input.decision,
  );

  const priority = normalizePriority(
    input.priority,
  );

  const publicResponse = normalizeText(
    input.publicResponse,
    "The public response",
    0,
    2000,
  );

  const internalReason = normalizeText(
    input.internalReason,
    "The internal administrative reason",
    10,
    2000,
  );

  validatePublicResponse(
    decision,
    publicResponse,
  );

  const complaintReference = adminDb
    .collection(COMPLAINTS_COLLECTION)
    .doc(complaintId);

  return adminDb.runTransaction(
    async (transaction) => {
      const complaintSnapshot =
        await transaction.get(
          complaintReference,
        );

      if (!complaintSnapshot.exists) {
        throw new Error(
          "The complaint no longer exists.",
        );
      }

      const complaintData =
        complaintSnapshot.data() ?? {};

      if (complaintData.isDeleted === true) {
        throw new Error(
          "A deleted complaint cannot be modified.",
        );
      }

      const currentStatus =
        normalizeStoredStatus(
          complaintData.status,
        );

      const nextStatus =
        decisionStatus[decision];

      validateTransition(
        currentStatus,
        nextStatus,
      );

      const complaintOwnerId =
        normalizeOwnedUserId(
          complaintData.userId,
        );

      const providerId =
        optionalDocumentId(
          complaintData.providerId,
        );

      /*
       * Firestore requires every transactional read to
       * happen before transactional writes.
       */
      const providerSnapshot =
        decision ===
          "request_provider_response" &&
        providerId
          ? await transaction.get(
              adminDb
                .collection(
                  PROVIDERS_COLLECTION,
                )
                .doc(providerId),
            )
          : null;

      const providerOwnerId =
        providerSnapshot?.exists
          ? optionalDocumentId(
              providerSnapshot.data()?.ownerId,
            )
          : null;

      const timestamp =
        FieldValue.serverTimestamp();

      const complaintUpdate:
        Record<string, unknown> = {
          status: nextStatus,
          priority,
          assignedAdminId:
            administrator.uid,
          assignedAt:
            complaintData.assignedAt ??
            timestamp,
          updatedAt: timestamp,
        };

      applyResolutionFields({
        update: complaintUpdate,
        decision,
        publicResponse,
        administratorId:
          administrator.uid,
        timestamp,
      });

      transaction.update(
        complaintReference,
        complaintUpdate,
      );

      const auditReference = adminDb
        .collection(ADMIN_LOGS_COLLECTION)
        .doc();

      transaction.create(
        auditReference,
        {
          actorId: administrator.uid,
          actorRole: "admin",
          action:
            `complaint_${decision}`,
          targetCollection:
            COMPLAINTS_COLLECTION,
          targetId: complaintId,
          source: "web_admin",
          reason: internalReason,
          before: {
            status: currentStatus,
            priority:
              normalizeStoredPriority(
                complaintData.priority,
              ),
          },
          after: {
            status: nextStatus,
            priority,
          },
          metadata: {
            publicResponse:
              publicResponse || null,
            providerId,
          },
          createdAt: timestamp,
        },
      );

      createComplaintNotification({
        transaction,
        recipientId:
          complaintOwnerId,
        complaintId,
        decision,
        status: nextStatus,
        publicResponse,
        timestamp,
      });

      if (
        decision ===
          "request_provider_response" &&
        providerOwnerId &&
        providerOwnerId !==
          complaintOwnerId
      ) {
        createProviderResponseNotification({
          transaction,
          recipientId:
            providerOwnerId,
          complaintId,
          publicResponse,
          timestamp,
        });
      }

      return {
        complaintId,
        status: nextStatus,
        priority,
        changed: true,
      };
    },
  );
}

function applyResolutionFields({
  update,
  decision,
  publicResponse,
  administratorId,
  timestamp,
}: {
  update: Record<string, unknown>;
  decision: AdminComplaintDecision;
  publicResponse: string;
  administratorId: string;
  timestamp: FieldValue;
}) {
  if (
    decision === "resolve" ||
    decision === "dismiss"
  ) {
    update.resolution =
      publicResponse;
    update.resolvedAt =
      timestamp;
    update.resolvedBy =
      administratorId;

    return;
  }

  if (decision === "reopen") {
    update.resolution = null;
    update.resolvedAt = null;
    update.resolvedBy = null;
  }
}

function createComplaintNotification({
  transaction,
  recipientId,
  complaintId,
  decision,
  status,
  publicResponse,
  timestamp,
}: {
  transaction: FirebaseFirestore.Transaction;
  recipientId: string;
  complaintId: string;
  decision: AdminComplaintDecision;
  status: ComplaintStatus;
  publicResponse: string;
  timestamp: FieldValue;
}) {
  const notificationReference =
    adminDb
      .collection(
        NOTIFICATIONS_COLLECTION,
      )
      .doc();

  transaction.create(
    notificationReference,
    {
      userId: recipientId,
      title:
        notificationTitle(
          decision,
        ),
      message:
        publicResponse ||
        defaultNotificationMessage(
          status,
        ),
      type: "complaint",
      relatedId: complaintId,
      relatedCollection:
        COMPLAINTS_COLLECTION,
      isRead: false,
      readAt: null,
      createdAt: timestamp,
    },
  );
}

function createProviderResponseNotification({
  transaction,
  recipientId,
  complaintId,
  publicResponse,
  timestamp,
}: {
  transaction: FirebaseFirestore.Transaction;
  recipientId: string;
  complaintId: string;
  publicResponse: string;
  timestamp: FieldValue;
}) {
  transaction.create(
    adminDb
      .collection(
        NOTIFICATIONS_COLLECTION,
      )
      .doc(),
    {
      userId: recipientId,
      title:
        "Response requested for a complaint",
      message:
        publicResponse ||
        "FEASTA administration requested your response to a complaint.",
      type: "complaint",
      relatedId: complaintId,
      relatedCollection:
        COMPLAINTS_COLLECTION,
      isRead: false,
      readAt: null,
      createdAt: timestamp,
    },
  );
}

function notificationTitle(
  decision: AdminComplaintDecision,
) {
  switch (decision) {
    case "start_review":
      return "Complaint under review";

    case "request_customer_response":
      return "Additional information requested";

    case "request_provider_response":
      return "Provider response requested";

    case "escalate":
      return "Complaint escalated";

    case "resolve":
      return "Complaint resolved";

    case "dismiss":
      return "Complaint dismissed";

    case "close":
      return "Complaint closed";

    case "reopen":
      return "Complaint review reopened";
  }
}

function defaultNotificationMessage(
  status: ComplaintStatus,
) {
  switch (status) {
    case "under_review":
      return "FEASTA administration is reviewing your complaint.";

    case "awaiting_customer":
      return "FEASTA administration requires additional information from you.";

    case "awaiting_provider":
      return "FEASTA administration requested information from the provider.";

    case "escalated":
      return "Your complaint was escalated for further administrative review.";

    case "resolved":
      return "Your complaint has been resolved.";

    case "dismissed":
      return "Your complaint review has concluded and the complaint was dismissed.";

    case "closed":
      return "Your complaint case has been closed.";

    case "submitted":
      return "Your complaint was submitted.";
  }
}

function validateTransition(
  currentStatus: ComplaintStatus,
  nextStatus: ComplaintStatus,
) {
  if (
    !permittedTransitions[
      currentStatus
    ].includes(nextStatus)
  ) {
    throw new Error(
      `A complaint cannot move from ${formatStatus(
        currentStatus,
      )} to ${formatStatus(
        nextStatus,
      )}.`,
    );
  }
}

function validatePublicResponse(
  decision: AdminComplaintDecision,
  value: string,
) {
  const responseRequired =
    decision ===
      "request_customer_response" ||
    decision ===
      "request_provider_response" ||
    decision === "escalate" ||
    decision === "resolve" ||
    decision === "dismiss" ||
    decision === "close" ||
    decision === "reopen";

  if (
    responseRequired &&
    value.length < 10
  ) {
    throw new Error(
      "Provide a clear public response with at least 10 characters.",
    );
  }
}

function normalizeDecision(
  value: AdminComplaintDecision,
): AdminComplaintDecision {
  if (
    Object.hasOwn(
      decisionStatus,
      value,
    )
  ) {
    return value;
  }

  throw new Error(
    "The complaint decision is invalid.",
  );
}

function normalizeStoredStatus(
  value: unknown,
): ComplaintStatus {
  const normalized =
    stringValue(value).toLowerCase();

  if (
    complaintStatuses.has(
      normalized,
    )
  ) {
    return normalized as
      ComplaintStatus;
  }

  throw new Error(
    "The complaint has an invalid status.",
  );
}

function normalizePriority(
  value: unknown,
): ComplaintPriority {
  const normalized =
    stringValue(value).toLowerCase();

  if (
    complaintPriorities.has(
      normalized,
    )
  ) {
    return normalized as
      ComplaintPriority;
  }

  throw new Error(
    "The complaint priority is invalid.",
  );
}

function normalizeStoredPriority(
  value: unknown,
): ComplaintPriority {
  const normalized =
    stringValue(value).toLowerCase();

  return complaintPriorities.has(
    normalized,
  )
    ? normalized as
        ComplaintPriority
    : "normal";
}

function normalizeOwnedUserId(
  value: unknown,
) {
  const normalized =
    stringValue(value);

  if (
    !SAFE_DOCUMENT_ID.test(
      normalized,
    )
  ) {
    throw new Error(
      "The complaint owner is invalid.",
    );
  }

  return normalized;
}

function optionalDocumentId(
  value: unknown,
) {
  const normalized =
    stringValue(value);

  return SAFE_DOCUMENT_ID.test(
    normalized,
  )
    ? normalized
    : null;
}

function normalizeDocumentId(
  value: unknown,
  label: string,
) {
  const normalized =
    stringValue(value);

  if (
    !SAFE_DOCUMENT_ID.test(
      normalized,
    )
  ) {
    throw new Error(
      `The ${label} identifier is invalid.`,
    );
  }

  return normalized;
}

function normalizeText(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number,
) {
  const normalized =
    stringValue(value);

  if (
    normalized.length <
      minimumLength ||
    normalized.length >
      maximumLength
  ) {
    throw new Error(
      `${label} must contain between ${minimumLength} and ${maximumLength} characters.`,
    );
  }

  return normalized;
}

function stringValue(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim()
    : value == null
      ? ""
      : String(value).trim();
}

function formatStatus(
  value: ComplaintStatus,
) {
  return value.replaceAll(
    "_",
    " ",
  );
}

function normalizeComplaintFilters(
  input: AdminComplaintFilters,
) {
  const search =
    stringValue(
      input.search,
    )
      .toLowerCase()
      .slice(0, 100);

  const status =
    input.status === "all" ||
    complaintStatuses.has(
      input.status,
    )
      ? input.status
      : "all";

  const priority =
    input.priority === "all" ||
    complaintPriorities.has(
      input.priority,
    )
      ? input.priority
      : "all";

  const pageSize =
    ALLOWED_PAGE_SIZES.includes(
      input.pageSize,
    )
      ? input.pageSize
      : DEFAULT_PAGE_SIZE;

  return {
    search,
    status:
      status as
        | "all"
        | ComplaintStatus,
    priority:
      priority as
        | "all"
        | ComplaintPriority,
    pageSize,
    cursor:
      input.cursor ?? null,
  };
}

function complaintMatchesSearch(
  complaint: AdminComplaint,
  search: string,
) {
  const searchableValues = [
    complaint.id,
    complaint.category,
    complaint.description,
    complaint.complainantName,
    complaint.complainantEmail,
    complaint.providerName ?? "",
  ];

  return searchableValues.some(
    (value) =>
      value
        .toLowerCase()
        .includes(search),
  );
}

function createAccountName(
  data: DocumentData,
) {
  const firstName =
    stringValue(
      data.firstName,
    );

  const lastName =
    stringValue(
      data.lastName,
    );

  const fullName =
    `${firstName} ${lastName}`.trim();

  return (
    fullName ||
    stringValue(
      data.displayName,
    ) ||
    stringValue(
      data.email,
    ) ||
    "Unknown account"
  );
}

function normalizeEvidenceUrls(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (
        item,
      ): item is string =>
        typeof item ===
        "string",
    )
    .map((item) =>
      item.trim(),
    )
    .filter(Boolean)
    .slice(0, 20);
}

function nullableString(
  value: unknown,
) {
  const normalized =
    stringValue(value);

  return normalized
    ? normalized
    : null;
}

function isoDateValue(
  value: unknown,
) {
  if (
    value instanceof Timestamp
  ) {
    return value
      .toDate()
      .toISOString();
  }

  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    typeof value ===
      "string" ||
    typeof value ===
      "number"
  ) {
    const parsed =
      new Date(value);

    if (
      !Number.isNaN(
        parsed.getTime(),
      )
    ) {
      return parsed.toISOString();
    }
  }

  return null;
}

function encodeComplaintCursor(
  document: QueryDocumentSnapshot<DocumentData>,
) {
  const createdAt =
    isoDateValue(
      document.data().createdAt,
    );

  if (!createdAt) {
    return null;
  }

  const payload:
    ComplaintCursor = {
      createdAtMilliseconds:
        new Date(
          createdAt,
        ).getTime(),
      documentId:
        document.id,
    };

  return Buffer.from(
    JSON.stringify(payload),
    "utf8",
  ).toString(
    "base64url",
  );
}

function decodeComplaintCursor(
  value: string | null,
): ComplaintCursor | null {
  if (!value) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(
        Buffer.from(
          value,
          "base64url",
        ).toString(
          "utf8",
        ),
      ) as Partial<ComplaintCursor>;

    if (
      typeof parsed
        .createdAtMilliseconds !==
        "number" ||
      !Number.isFinite(
        parsed
          .createdAtMilliseconds,
      ) ||
      typeof parsed
        .documentId !==
        "string" ||
      !SAFE_DOCUMENT_ID.test(
        parsed.documentId,
      )
    ) {
      return null;
    }

    return {
      createdAtMilliseconds:
        parsed
          .createdAtMilliseconds,
      documentId:
        parsed.documentId,
    };
  } catch {
    return null;
  }
}