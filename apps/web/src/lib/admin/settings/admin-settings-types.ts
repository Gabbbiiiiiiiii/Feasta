export type AdminPlatformSettings = {
  platformName: string;
  operatingCity: string;
  supportEmail: string;
  serviceAreaDescription: string;

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
   * Private administrative justification stored only
   * in the immutable audit record.
   */
  internalReason: string;
};

export type UpdateAdminPlatformSettingsResult = {
  settings: AdminPlatformSettings;
  changed: boolean;
};