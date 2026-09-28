export type ProviderPayoutSetupStatus =
  | "not_started"
  | "onboarding"
  | "action_required"
  | "ready"
  | "unavailable";

export type ProviderLinkedAccountType =
  | "consumer"
  | "merchant";

export type ProviderSettlementTransportMode =
  | "disabled"
  | "wallet_transfer"
  | "workflow";

export type ProviderPayoutAccountView = {
  setupStatus: ProviderPayoutSetupStatus;
  linkedAccountType: ProviderLinkedAccountType | null;

  invitationStatus: string | null;
  activationStatus: string | null;

  /*
   * P9 account/onboarding readiness.
   * This does NOT mean FEASTA can dispatch Provider settlement.
   */
  payoutReady: boolean;

  relationshipStatus: string | null;

  settlementTransportMode:
    ProviderSettlementTransportMode;

  settlementTransportReady: boolean;

  paymongoAccountId: string | null;
  childAccountPresent: boolean;
  activationProfileComplete: boolean;
  identityVerificationStatus: string | null;
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

export type ProviderSettlementStatus =
  | "awaiting_availability"
  | "ready"
  | "reserved"
  | "processing"
  | "paid"
  | "reconciliation_required"
  | "cancelled";

export type ProviderSettlementView = {
  settlementId: string;

  earningId: string;
  paymentId: string;
  providerRequestId: string;
  mainEventId: string;

  status: ProviderSettlementStatus;

  netSettlementAmountInCentavos: number;
  reservedAmountInCentavos: number;
  paidOutAmountInCentavos: number;

  reconciliationRequired: boolean;
  reconciliationReason: string | null;

  activePayoutAttemptId: string | null;
  lastPayoutAttemptId: string | null;

  createdAt: string;
  updatedAt: string | null;
  paidOutAt: string | null;
};

export type ProviderSettlementSummary = {
  awaitingAvailabilityAmountInCentavos: number;
  readyAmountInCentavos: number;
  reservedAmountInCentavos: number;
  paidOutAmountInCentavos: number;
  reconciliationRequiredCount: number;
};

export type ProviderFinanceOverview = {
  payoutAccount: ProviderPayoutAccountView;

  earnings: ProviderEarning[];
  earningSummary: ProviderEarningSummary;

  settlements: ProviderSettlementView[];
  settlementSummary: ProviderSettlementSummary;
};

export type ProviderPayoutActivationAddressInput = {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: "PH";
  postalCode: string;
};

export type ProviderPayoutActivationInput = {
  nationality: string;
  placeOfBirthCity: string;
  placeOfBirthCountry: string;
  natureOfWork: string;
  sourceOfFunds: string;
  sourceOfFundsSalary: string | null;
  sourceOfFundsOther: string | null;
  personTin: string;
  currentAddress: ProviderPayoutActivationAddressInput;
  business: {
    legalType: string;
    address: ProviderPayoutActivationAddressInput;
    industry: string;
    age: string;
    size: string;
    estimatedMonthlyVolume: string;
    tin: string;
  } | null;
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