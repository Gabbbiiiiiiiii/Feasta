export type MockWithdrawalDestinationType =
  | "gcash"
  | "bank";

export type MockProviderWithdrawalInput = {
  clientRequestId: string;
  amountInCentavos: number;
  destinationType: MockWithdrawalDestinationType;
  accountName: string;
  mobileNumber?: string;
  bankName?: string;
  accountNumber?: string;
};

export type MockProviderWithdrawalResult = {
  withdrawalId: string;
  amountInCentavos: number;
  currency: "PHP";
  status: "succeeded";
  mode: "mock";
  destination: {
    type: MockWithdrawalDestinationType;
    accountName: string;
    mobileMasked: string | null;
    bankName: string | null;
    accountNumberMasked: string | null;
  };
  allocationCount: number;
  completedAt: string | null;
};
