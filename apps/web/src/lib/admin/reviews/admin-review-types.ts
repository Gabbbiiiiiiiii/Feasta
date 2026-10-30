export const ADMIN_REVIEW_MODERATION_STATUSES = [
  "published",
  "hidden",
] as const;

export type AdminReviewModerationStatus =
  (typeof ADMIN_REVIEW_MODERATION_STATUSES)[number];

export type AdminReviewModerationStatusFilter =
  | "all"
  | AdminReviewModerationStatus;

export type AdminReviewReportFilter =
  | "all"
  | "reported"
  | "not_reported";

export type AdminReviewRatingFilter =
  | "all"
  | "5"
  | "4"
  | "3"
  | "2"
  | "1";

export type AdminReviewDateFilter =
  | "all"
  | "today"
  | "last_7_days"
  | "last_30_days";

export type AdminReviewSortField =
  | "createdAt"
  | "rating";

export type AdminReviewSortDirection =
  | "ascending"
  | "descending";

export type AdminReviewModerationAction =
  | "hide"
  | "restore"
  | "dismiss_report";

export type AdminReviewFilters = {
  search: string;
  status: AdminReviewModerationStatusFilter;
  report: AdminReviewReportFilter;
  rating: AdminReviewRatingFilter;
  date: AdminReviewDateFilter;
  sortField: AdminReviewSortField;
  sortDirection: AdminReviewSortDirection;
  pageSize: number;
  cursor?: string | null;
};

export type AdminReview = {
  id: string;
  reviewId: string;

  providerRequestId: string | null;
  bookingId: string;
  bookingCode: string | null;
  packageId: string | null;
  packageName: string | null;

  customerId: string;
  customerName: string;
  customerEmail: string | null;

  providerId: string;
  providerName: string;
  providerOwnerId: string | null;

  rating: number;
  comment: string;

  providerReply: string | null;
  providerReplyAt: string | null;

  moderationStatus:
    AdminReviewModerationStatus;
  moderationReason: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;

  isVisible: boolean;
  isReported: boolean;
  isDeleted: boolean;

  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminReviewStatistics = {
  totalCount: number;
  publishedCount: number;
  reportedCount: number;
  hiddenCount: number;
  averageRating: number;
};

export type AdminReviewPage = {
  reviews: AdminReview[];
  statistics: AdminReviewStatistics;
  nextCursor: string | null;
  hasMore: boolean;
};

export type AdminReviewAuditEntry = {
  id: string;
  action: string;
  actorId: string;
  actorRole: string;
  reason: string | null;
  source: string | null;
  beforeStatus: string | null;
  afterStatus: string | null;
  createdAt: string | null;
};

export type AdminReviewDetails = {
  review: AdminReview;

  booking: {
    exists: boolean;
    id: string;
    bookingCode: string | null;
    eventType: string | null;
    eventDate: string | null;
    status: string | null;
  };

  provider: {
    exists: boolean;
    id: string;
    name: string;
    ownerId: string | null;
    verificationStatus: string | null;
    ratingAverage: number;
    reviewCount: number;
  };

  auditHistory: AdminReviewAuditEntry[];
};

export type AdminReviewDetailsResult = {
  details: AdminReviewDetails;
};

export type ModerateAdminReviewInput = {
  reviewId: string;
  action: AdminReviewModerationAction;
  reason?: string;
  idempotencyKey: string;
};

export type ModerateAdminReviewResult = {
  reviewId: string;
  moderationStatus:
    AdminReviewModerationStatus;
  isVisible: boolean;
  isReported: boolean;
  idempotentReplay: boolean;
};
