import type {
  AnnouncementAudience,
  AnnouncementStatus,
} from "@feasta/shared-types";

export type AdminAnnouncementStatusFilter = "all" | AnnouncementStatus;
export type AdminAnnouncementAudienceFilter = "all" | AnnouncementAudience;

export type AdminAnnouncementFilters = {
  search: string;
  status: AdminAnnouncementStatusFilter;
  audience: AdminAnnouncementAudienceFilter;
  pageSize: number;
  cursor?: string | null;
};

export type AdminAnnouncement = {
  id: string;
  title: string;
  content: string;
  audience: AnnouncementAudience;
  status: AnnouncementStatus;
  adminNotes: string;
  createdAt: string | null;
  createdBy: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  archivedAt: string | null;
  archivedBy: string | null;
  archiveReason: string | null;
};

export type AdminAnnouncementStatistics = {
  totalCount: number;
  draftCount: number;
  publishedCount: number;
  archivedCount: number;
};

export type AdminAnnouncementPage = {
  announcements: AdminAnnouncement[];
  statistics: AdminAnnouncementStatistics;
  nextCursor: string | null;
  hasMore: boolean;
};

export type AnnouncementDraftInput = {
  title: string;
  content: string;
  audience: AnnouncementAudience;
  adminNotes: string;
};

export type CreateAnnouncementResult = {
  announcementId: string;
};

export type AnnouncementMutationResult = {
  announcement: AdminAnnouncement;
};
