import type {
  ComplaintPriority,
  ComplaintStatus,
} from "@feasta/shared-types";

export type AdminComplaint = {
  id: string;

  userId: string;
  complainantName: string;
  complainantEmail: string;
  complainantRole: string | null;

  providerId: string | null;
  providerName: string | null;
  providerOwnerId: string | null;

  category: string;
  description: string;
  evidenceUrls: string[];

  status: ComplaintStatus;
  priority: ComplaintPriority;

  resolution: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;

  assignedAdminId: string | null;
  assignedAt: string | null;

  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminComplaintStatistics = {
  totalComplaints: number;
  submitted: number;
  underReview: number;
  awaitingResponse: number;
  escalated: number;
  resolved: number;
  dismissed: number;
  closed: number;
};

export type AdminComplaintFilters = {
  search: string;
  status: "all" | ComplaintStatus;
  priority: "all" | ComplaintPriority;
  pageSize: number;
  cursor?: string | null;
};

export type AdminComplaintPage = {
  complaints: AdminComplaint[];
  statistics: AdminComplaintStatistics;
  nextCursor: string | null;
  hasMore: boolean;
};

export type AdminComplaintDetails = {
  complaint: AdminComplaint;
};

export type AdminComplaintDecision =
  | "start_review"
  | "request_customer_response"
  | "request_provider_response"
  | "escalate"
  | "resolve"
  | "dismiss"
  | "close"
  | "reopen";

export type ManageAdminComplaintInput = {
  complaintId: string;
  decision: AdminComplaintDecision;
  priority: ComplaintPriority;

  /**
   * Safe message that may be shown to the complainant
   * and affected provider.
   */
  publicResponse: string;

  /**
   * Private administrative justification stored in
   * the immutable audit record.
   */
  internalReason: string;
};

export type ManageAdminComplaintResult = {
  complaintId: string;
  status: ComplaintStatus;
  priority: ComplaintPriority;
  changed: boolean;
};