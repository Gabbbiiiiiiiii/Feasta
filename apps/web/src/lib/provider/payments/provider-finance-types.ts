export type ProviderPayoutSetupStatus =
  | "not_started"
  | "onboarding"
  | "action_required"
  | "ready"
  | "unavailable";

export type ProviderLinkedAccountType =
  | "consumer"
  | "merchant";

export type ProviderPayoutAccountView = {
  setupStatus: ProviderPayoutSetupStatus;
  linkedAccountType: ProviderLinkedAccountType | null;
  invitationStatus: string | null;
  activationStatus: string | null;
  payoutReady: boolean;
  paymongoAccountId: string | null;
  updatedAt: string | null;
};

export type ProviderEarningStatus =
  | "pending"
  | "available"
  | "paid"
  | "reversed";

export type ProviderEarning = {
  earningId: string;
  paymentId: string;
  providerRequestId: string;
  mainEventId: string;
  status: ProviderEarningStatus;
  earningAmountInCentavos: number;
  pendingAmountInCentavos: number;
  availableAmountInCentavos: number;
  paidAmountInCentavos: number;
  reversedAmountInCentavos: number;
  commissionDeductedInCentavos: number;
  withholdingDeductedInCentavos: number;
  createdAt: string;
  updatedAt: string | null;
};

export type ProviderEarningSummary = {
  pendingAmountInCentavos: number;
  availableAmountInCentavos: number;
  paidAmountInCentavos: number;
  reversedAmountInCentavos: number;
};

export type ProviderFinanceOverview = {
  payoutAccount: ProviderPayoutAccountView;
  earnings: ProviderEarning[];
  earningSummary: ProviderEarningSummary;
};

export type ProviderPayoutOnboardingResult = {
  setupStatus: ProviderPayoutSetupStatus;
  payoutReady: boolean;
  linkedAccountType: ProviderLinkedAccountType;
  invitationStatus: string | null;
  activationStatus: string | null;
  onboardingUrl: string | null;
};

export type ProviderPayoutRefreshResult = {
  setupStatus: ProviderPayoutSetupStatus;
  payoutReady: boolean;
  linkedAccountType: ProviderLinkedAccountType;
  invitationStatus: string | null;
  activationStatus: string | null;
};