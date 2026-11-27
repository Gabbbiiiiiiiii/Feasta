export type AdminAuditLogCategory =
  | "admin"
  | "money"
  | "bookings"
  | "security";

export type AdminAuditLogCategoryFilter = "all" | AdminAuditLogCategory;

export type AdminAuditLogFilters = {
  search: string;
  category?: AdminAuditLogCategoryFilter;
  action: string;
  actorRole: string;
  source: string;
  targetCollection: string;
  fromDate: string;
  toDate: string;
  pageSize: number;
  cursor: string | null;
};

export type AdminAuditLog = {
  id: string;
  createdAt: string | null;
  action: string;
  category?: AdminAuditLogCategory;
  actorId: string;
  actorName?: string | null;
  actorRole: string;
  targetCollection: string;
  targetId: string;
  source: string;
  correlationId: string | null;
  outcome: string | null;
  reasonCode: string | null;
  summary: string;
};

export type AdminAuditLogPreviewField = {
  key: string;
  value: string;
  redacted: boolean;
};

export type AdminAuditLogDetail = AdminAuditLog & {
  description: string | null;
  beforePreview: AdminAuditLogPreviewField[];
  afterPreview: AdminAuditLogPreviewField[];
  metadataPreview: AdminAuditLogPreviewField[];
};

export type AdminAuditLogSummary = {
  windowLimit: number;
  windowCount: number;
  adminActorCount: number;
  adminActionCount?: number;
  userActionCount?: number;
  providerActionCount?: number;
  customerActionCount?: number;
  systemActionCount?: number;
  categoryCounts?: {
    admin: number;
    money: number;
    bookings: number;
    security: number;
  };
  succeededOutcomeCount: number;
  attentionOutcomeCount: number;
};

export type AdminAuditLogFilterOptions = {
  actions: string[];
  actorRoles: string[];
  sources: string[];
  targetCollections: string[];
};

export type AdminAuditLogPage = {
  auditLogs: AdminAuditLog[];
  summary: AdminAuditLogSummary;
  filterOptions: AdminAuditLogFilterOptions;
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number | null;
  totalPages?: number | null;
  scan: {
    scannedCount: number;
    scanLimit: number;
    filtered: boolean;
    reachedLimit: boolean;
  };
};
