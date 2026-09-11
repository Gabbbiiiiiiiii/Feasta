export type AdminManagedRole = "customer" | "provider";

export type AdminAccountStatus =
  | "active"
  | "disabled"
  | "blocked";

export type AdminAccountAccessDecision =
  | "disable"
  | "block"
  | "restore";

export type ManageAdminAccountAccessInput = {
  userId: string;
  decision: AdminAccountAccessDecision;

  /**
   * Safe explanation displayed to the affected user.
   * Do not include confidential investigation details.
   */
  userExplanation: string;

  /**
   * Private administrative justification stored only
   * in the immutable audit record.
   */
  internalReason: string;
};

export type ManageAdminAccountAccessResult = {
  userId: string;
  accountStatus: AdminAccountStatus;
  changed: boolean;
};

export type AdminVerificationStatus =
  | "verified"
  | "pending"
  | "rejected";

export type AdminUser = {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  initials: string;
  email: string;
  phoneNumber: string;
  role: AdminManagedRole;
  profileImageUrl: string | null;

  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  isActive: boolean;
  isBlocked: boolean;
  accountStatus: AdminAccountStatus;

  createdAt: string | null;
  updatedAt: string | null;
  lastLoginAt: string | null;

  providerId: string | null;
  businessName: string | null;
  providerServiceType: string | null;
  providerCategory: string | null;
  verificationStatus:
    | AdminVerificationStatus
    | null;
};

export type AdminUserBookingSummary = {
  id: string;
  reference: string;

  relationship:
    | "customer"
    | "provider";

  eventType: string;
  eventDate: string | null;
  city: string;

  bookingStatus: string;
  paymentStatus: string | null;
  providerRequestStatus: string | null;

  createdAt: string | null;
};

export type AdminUserActivityEntry = {
  id: string;

  action: string;
  actorId: string;
  actorRole: string;

  targetCollection: string;
  targetId: string;

  reason: string | null;
  source: string | null;

  createdAt: string | null;
};

export type AdminUserVerificationDocument = {
  id: string;
  verificationId: string;

  documentType: string;
  title: string;
  fileName: string;
  fileSize: string;
  contentType: string;
  status: string;
  isRequired: boolean;

  uploadedAt: string | null;
  reviewedAt: string | null;

  viewPath: string;
  downloadPath: string;
};

export type AdminUserDetails = {
  userId: string;
  role: AdminManagedRole;

  bookings: AdminUserBookingSummary[];
  activity: AdminUserActivityEntry[];
  documents:
    AdminUserVerificationDocument[];

  limits: {
    bookings: number;
    activity: number;
  };
};

export type AdminUserDetailsResult = {
  details: AdminUserDetails;
};

export type AdminUserStatistics = {
  totalAccounts: number;
  customers: number;
  providers: number;
  verifiedProviders: number;
  pendingProviders: number;
  restrictedAccounts: number;
  registeredThisMonth: number;
  registeredLastMonth: number;
  accountGrowthPercentage: number | null;
};

export type AdminUserFilters = {
  search: string;
  role: "all" | AdminManagedRole;
  accountStatus: "all" | AdminAccountStatus;
  verificationStatus:
    | "all"
    | AdminVerificationStatus;
  pageSize: number;
  cursor?: string | null;
};

export type AdminUserPage = {
  users: AdminUser[];
  statistics: AdminUserStatistics;
  nextCursor: string | null;
  hasMore: boolean;
};