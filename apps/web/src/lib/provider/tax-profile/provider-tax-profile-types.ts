import type {
  TaxRegistrationStatus,
} from "@feasta/shared-types";

export type ProviderTaxProfileVerificationStatus =
  | "pending"
  | "verified"
  | "rejected";

export type ProviderTaxProfile = {
  providerId: string;

  birRegisteredName: string;
  tin: string;

  taxType:
    TaxRegistrationStatus | null;

  verificationStatus:
    ProviderTaxProfileVerificationStatus | null;

  submittedAt:
    string | null;

  verifiedAt:
    string | null;

  rejectedAt:
    string | null;

  rejectionReason:
    string | null;

  updatedAt:
    string | null;
};

export type SubmitProviderTaxProfileInput = {
  birRegisteredName: string;
  tin: string;
  taxType:
    TaxRegistrationStatus;
};

export type SubmitProviderTaxProfileResult = {
  providerId: string;

  verificationStatus:
    "pending" |
    "verified";

  changed: boolean;
};
