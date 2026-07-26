export type AdminManagedRole = "customer" | "provider";

export type AdminAccountStatus =
  | "active"
  | "disabled"
  | "blocked";

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