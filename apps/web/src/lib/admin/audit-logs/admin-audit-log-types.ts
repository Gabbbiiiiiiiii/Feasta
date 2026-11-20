export type AdminAuditLogFilters = {
  search: string;
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
  actorId: string;
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
  scan: {
    scannedCount: number;
    scanLimit: number;
    filtered: boolean;
    reachedLimit: boolean;
  };
};
