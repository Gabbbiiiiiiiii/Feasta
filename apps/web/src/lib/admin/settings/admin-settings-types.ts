import type {
  TaxRegistrationStatus,
} from "@feasta/shared-types";

export type AdminPlatformSettings = {
  platformName: string;
  operatingCity: string;
  supportEmail: string;
  serviceAreaDescription: string;

  platformCommissionRateBps: number;

  /**
   * This is system configuration.
   *
   * For the capstone, vat_registered represents
   * a simulation/configuration and does not claim
   * that FEASTA is actually BIR VAT-registered.
   */
  platformTaxStatus:
    TaxRegistrationStatus;

  platformVatRateBps: number;

  /**
   * Incremented only when the financial policy
   * actually changes.
   */
  financialPolicyVersion: number;

  financialPolicyEffectiveAt:
    string | null;

  timezone: "Asia/Manila";
  currencyCode: "PHP";
  schemaVersion: 1;
  isPublic: true;

  updatedAt: string | null;
  updatedBy: string | null;
};

export type UpdateAdminPlatformSettingsInput = {
  platformName: string;
  operatingCity: string;
  supportEmail: string;
  serviceAreaDescription: string;

  /**
   * Private administrative justification stored
   * only in the immutable audit record.
   */
  internalReason: string;
};

export type UpdateAdminPlatformSettingsResult = {
  settings: AdminPlatformSettings;
  changed: boolean;
};

export type UpdateAdminFinancialPolicyInput = {
  platformCommissionRateBps: number;

  platformTaxStatus:
    TaxRegistrationStatus;

  platformVatRateBps: number;

  /**
   * Private administrative justification.
   */
  internalReason: string;
};

export type UpdateAdminFinancialPolicyResult = {
  settings: AdminPlatformSettings;
  changed: boolean;
};
