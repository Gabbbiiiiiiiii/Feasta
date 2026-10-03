import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import {
  DEFAULT_PLATFORM_COMMISSION_RATE_BPS,
  DEFAULT_PLATFORM_VAT_RATE_BPS,
  MAX_BALANCE_DUE_DAYS_BEFORE_EVENT,
  MAX_DEPOSIT_RATE_BPS,
  MIN_BALANCE_DUE_DAYS_BEFORE_EVENT,
  MIN_DEPOSIT_RATE_BPS,
  FIRESTORE_COLLECTIONS,
  parseTaxRegistrationStatus,
} from "@feasta/shared-types";

import type {
  AdminPlatformSettings,
  UpdateAdminFinancialPolicyResult,
  UpdateAdminPlatformSettingsResult,
} from "@/lib/admin/settings/admin-settings-types";
import {
  validateAdminFinancialPolicyUpdate,
  validateAdminPlatformSettingsUpdate,
} from "@/lib/admin/settings/admin-settings-validation";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const PLATFORM_SETTINGS_DOCUMENT = "platform";
const ADMIN_LOGS_COLLECTION = "adminLogs";

const defaultSettings: AdminPlatformSettings = {
  platformName: "FEASTA",
  operatingCity: "Ormoc City",
  supportEmail: "",
  serviceAreaDescription:
    "FEASTA serves customers and verified event service providers in Ormoc City.",

  platformCommissionRateBps:
    DEFAULT_PLATFORM_COMMISSION_RATE_BPS,

  /*
   * Capstone default means FEASTA does not
   * apply platform VAT. This is system
   * configuration, not evidence of BIR
   * registration status.
   */
  platformTaxStatus: "non_vat",

  /*
   * Stored as the demonstration/default VAT
   * rate but inactive while platformTaxStatus
   * is non_vat.
   */
  platformVatRateBps:
    DEFAULT_PLATFORM_VAT_RATE_BPS,

  minimumDepositRateBps:
    MIN_DEPOSIT_RATE_BPS,

  maximumDepositRateBps:
    MAX_DEPOSIT_RATE_BPS,

  minimumBalanceDueDaysBeforeEvent:
    MIN_BALANCE_DUE_DAYS_BEFORE_EVENT,

  maximumBalanceDueDaysBeforeEvent:
    MAX_BALANCE_DUE_DAYS_BEFORE_EVENT,

  financialPolicyVersion: 1,

  financialPolicyEffectiveAt:
    null,

  timezone: "Asia/Manila",
  currencyCode: "PHP",
  schemaVersion: 1,
  isPublic: true,
  updatedAt: null,
  updatedBy: null,
};

export async function getAdminPlatformSettings(): Promise<
  AdminPlatformSettings
> {
  await requireAdmin();

  const snapshot = await platformSettingsReference()
    .get();

  return mapPlatformSettings(snapshot);
}

export async function updateAdminPlatformSettings(
  input: unknown,
): Promise<UpdateAdminPlatformSettingsResult> {
  const administrator = await requireAdmin();
  const update =
    validateAdminPlatformSettingsUpdate(input);
  const settingsReference =
    platformSettingsReference();

  const changed = await adminDb.runTransaction(
    async (transaction) => {
      const snapshot = await transaction.get(
        settingsReference,
      );

      const current =
        mapPlatformSettings(snapshot);

      const next: AdminPlatformSettings = {
        platformName: update.platformName,
        operatingCity: update.operatingCity,
        supportEmail: update.supportEmail,
        serviceAreaDescription:
          update.serviceAreaDescription,

        /*
         * General platform-profile updates must
         * never mutate the financial policy.
         */
        platformCommissionRateBps:
          current
            .platformCommissionRateBps,

        platformTaxStatus:
          current.platformTaxStatus,

        platformVatRateBps:
          current.platformVatRateBps,

        minimumDepositRateBps:
          current.minimumDepositRateBps,

        maximumDepositRateBps:
          current.maximumDepositRateBps,

        minimumBalanceDueDaysBeforeEvent:
          current
            .minimumBalanceDueDaysBeforeEvent,

        maximumBalanceDueDaysBeforeEvent:
          current
            .maximumBalanceDueDaysBeforeEvent,

        financialPolicyVersion:
          current
            .financialPolicyVersion,

        financialPolicyEffectiveAt:
          current
            .financialPolicyEffectiveAt,

        timezone: "Asia/Manila",
        currencyCode: "PHP",
        schemaVersion: 1,
        isPublic: true,
        updatedAt: current.updatedAt,
        updatedBy: administrator.uid,
      };

      if (
        snapshot.exists &&
        settingsEqual(current, next)
      ) {
        return false;
      }

      const timestamp =
        FieldValue.serverTimestamp();

      const storedSettings = {
        platformName: next.platformName,
        operatingCity: next.operatingCity,
        supportEmail: next.supportEmail,
        serviceAreaDescription:
          next.serviceAreaDescription,
        timezone: next.timezone,
        currencyCode: next.currencyCode,
        schemaVersion: next.schemaVersion,
        isPublic: next.isPublic,
        updatedAt: timestamp,
        updatedBy: administrator.uid,
      };

      if (snapshot.exists) {
        transaction.update(
          settingsReference,
          storedSettings,
        );
      } else {
        transaction.create(
          settingsReference,
          {
            ...storedSettings,
            createdAt: timestamp,
            createdBy: administrator.uid,
          },
        );
      }

      transaction.create(
        adminDb
          .collection(ADMIN_LOGS_COLLECTION)
          .doc(),
        {
          actorId: administrator.uid,
          actorRole: "admin",
          action: snapshot.exists
            ? "platform_settings_updated"
            : "platform_settings_created",
          description: snapshot.exists
            ? "Updated the FEASTA platform settings."
            : "Created the FEASTA platform settings.",
          targetCollection:
            FIRESTORE_COLLECTIONS.appSettings,
          targetId: PLATFORM_SETTINGS_DOCUMENT,
          source: "web_admin",
          reason: update.internalReason,
          before: snapshot.exists
            ? auditSnapshot(current)
            : null,
          after: auditSnapshot(next),
          createdAt: timestamp,
        },
      );

      return true;
    },
  );

  const savedSnapshot =
    await settingsReference.get();

  return {
    settings:
      mapPlatformSettings(savedSnapshot),
    changed,
  };
}

export async function updateAdminFinancialPolicy(
  input: unknown,
): Promise<UpdateAdminFinancialPolicyResult> {
  const administrator =
    await requireAdmin();

  const update =
    validateAdminFinancialPolicyUpdate(
      input,
    );

  const settingsReference =
    platformSettingsReference();

  const changed =
    await adminDb.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(
            settingsReference,
          );

        const current =
          mapPlatformSettings(
            snapshot,
          );

        const storedData =
          snapshot.data() ?? {};

        /*
         * Older appSettings/platform documents
         * predate financial-policy fields.
         *
         * Mapped defaults must not make an
         * unstored legacy policy look persisted.
         */
        const hasStoredFinancialPolicy =
          snapshot.exists &&
          storedBasisPointRateOrNull(
            storedData
              .platformCommissionRateBps,
          ) !== null &&
          parseTaxRegistrationStatus(
            storedData.platformTaxStatus,
          ) !== null &&
          storedBasisPointRateOrNull(
            storedData.platformVatRateBps,
          ) !== null &&
          storedPositiveIntegerOrNull(
            storedData
              .financialPolicyVersion,
          ) !== null;

        const hasStoredPaymentTermPolicy =
          storedPaymentTermPolicyOrNull(
            storedData,
          ) !== null;

        const policyAlreadyStored =
          hasStoredFinancialPolicy &&
          hasStoredPaymentTermPolicy &&
          current.platformCommissionRateBps ===
            update.platformCommissionRateBps &&
          current.platformTaxStatus ===
            update.platformTaxStatus &&
          current.platformVatRateBps ===
            update.platformVatRateBps &&
          current.minimumDepositRateBps ===
            update.minimumDepositRateBps &&
          current.maximumDepositRateBps ===
            update.maximumDepositRateBps &&
          current.minimumBalanceDueDaysBeforeEvent ===
            update.minimumBalanceDueDaysBeforeEvent &&
          current.maximumBalanceDueDaysBeforeEvent ===
            update.maximumBalanceDueDaysBeforeEvent;

        if (policyAlreadyStored) {
          return false;
        }

        const timestamp =
          FieldValue.serverTimestamp();

        const nextVersion =
          hasStoredFinancialPolicy
            ? current
                .financialPolicyVersion +
              1
            : 1;

        const financialFields = {
          platformCommissionRateBps:
            update
              .platformCommissionRateBps,

          platformTaxStatus:
            update.platformTaxStatus,

          platformVatRateBps:
            update.platformVatRateBps,

          minimumDepositRateBps:
            update.minimumDepositRateBps,

          maximumDepositRateBps:
            update.maximumDepositRateBps,

          minimumBalanceDueDaysBeforeEvent:
            update
              .minimumBalanceDueDaysBeforeEvent,

          maximumBalanceDueDaysBeforeEvent:
            update
              .maximumBalanceDueDaysBeforeEvent,

          financialPolicyVersion:
            nextVersion,

          financialPolicyEffectiveAt:
            timestamp,

          updatedAt:
            timestamp,

          updatedBy:
            administrator.uid,
        };

        if (snapshot.exists) {
          transaction.update(
            settingsReference,
            financialFields,
          );
        } else {
          transaction.create(
            settingsReference,
            {
              platformName:
                defaultSettings
                  .platformName,

              operatingCity:
                defaultSettings
                  .operatingCity,

              supportEmail:
                defaultSettings
                  .supportEmail,

              serviceAreaDescription:
                defaultSettings
                  .serviceAreaDescription,

              ...financialFields,

              timezone:
                defaultSettings.timezone,

              currencyCode:
                defaultSettings
                  .currencyCode,

              schemaVersion:
                defaultSettings
                  .schemaVersion,

              isPublic:
                defaultSettings
                  .isPublic,

              createdAt:
                timestamp,

              createdBy:
                administrator.uid,
            },
          );
        }

        transaction.create(
          adminDb
            .collection(
              ADMIN_LOGS_COLLECTION,
            )
            .doc(),
          {
            actorId:
              administrator.uid,

            actorRole:
              "admin",

            action:
              "financial_policy_updated",

            description:
              "Updated FEASTA financial and payment-term policy.",

            targetCollection:
              FIRESTORE_COLLECTIONS
                .appSettings,

            targetId:
              PLATFORM_SETTINGS_DOCUMENT,

            source:
              "web_admin",

            reason:
              update.internalReason,

            before:
              snapshot.exists
                ? financialAuditSnapshot(
                    current,
                  )
                : null,

            after: {
              platformCommissionRateBps:
                update
                  .platformCommissionRateBps,

              platformTaxStatus:
                update
                  .platformTaxStatus,

              platformVatRateBps:
                update
                  .platformVatRateBps,

              minimumDepositRateBps:
                update
                  .minimumDepositRateBps,

              maximumDepositRateBps:
                update
                  .maximumDepositRateBps,

              minimumBalanceDueDaysBeforeEvent:
                update
                  .minimumBalanceDueDaysBeforeEvent,

              maximumBalanceDueDaysBeforeEvent:
                update
                  .maximumBalanceDueDaysBeforeEvent,

              financialPolicyVersion:
                nextVersion,
            },

            createdAt:
              timestamp,
          },
        );

        return true;
      },
    );

  const savedSnapshot =
    await settingsReference.get();

  return {
    settings:
      mapPlatformSettings(
        savedSnapshot,
      ),
    changed,
  };
}

function platformSettingsReference() {
  return adminDb
    .collection(
      FIRESTORE_COLLECTIONS.appSettings,
    )
    .doc(PLATFORM_SETTINGS_DOCUMENT);
}

function mapPlatformSettings(
  snapshot: DocumentSnapshot<DocumentData>,
): AdminPlatformSettings {
  if (!snapshot.exists) {
    return {...defaultSettings};
  }

  const data = snapshot.data() ?? {};

  const paymentTermPolicy =
    storedPaymentTermPolicyOrNull(
      data,
    );

  return {
    platformName: storedText(
      data.platformName,
      defaultSettings.platformName,
    ),
    operatingCity: storedText(
      data.operatingCity,
      defaultSettings.operatingCity,
    ),
    supportEmail: storedText(
      data.supportEmail,
      defaultSettings.supportEmail,
    ),
    serviceAreaDescription: storedText(
      data.serviceAreaDescription,
      defaultSettings.serviceAreaDescription,
    ),

    platformCommissionRateBps:
      storedBasisPointRate(
        data.platformCommissionRateBps,
        defaultSettings
          .platformCommissionRateBps,
      ),

    platformTaxStatus:
      parseTaxRegistrationStatus(
        data.platformTaxStatus,
      ) ??
      defaultSettings
        .platformTaxStatus,

    platformVatRateBps:
      storedBasisPointRate(
        data.platformVatRateBps,
        defaultSettings
          .platformVatRateBps,
      ),

    minimumDepositRateBps:
      paymentTermPolicy
        ?.minimumDepositRateBps ??
      defaultSettings
        .minimumDepositRateBps,

    maximumDepositRateBps:
      paymentTermPolicy
        ?.maximumDepositRateBps ??
      defaultSettings
        .maximumDepositRateBps,

    minimumBalanceDueDaysBeforeEvent:
      paymentTermPolicy
        ?.minimumBalanceDueDaysBeforeEvent ??
      defaultSettings
        .minimumBalanceDueDaysBeforeEvent,

    maximumBalanceDueDaysBeforeEvent:
      paymentTermPolicy
        ?.maximumBalanceDueDaysBeforeEvent ??
      defaultSettings
        .maximumBalanceDueDaysBeforeEvent,

    financialPolicyVersion:
      storedPositiveInteger(
        data.financialPolicyVersion,
        defaultSettings
          .financialPolicyVersion,
      ),

    financialPolicyEffectiveAt:
      timestampToIsoString(
        data
          .financialPolicyEffectiveAt,
      ),

    timezone: "Asia/Manila",
    currencyCode: "PHP",
    schemaVersion: 1,
    isPublic: true,
    updatedAt: timestampToIsoString(
      data.updatedAt,
    ),
    updatedBy:
      typeof data.updatedBy === "string"
        ? data.updatedBy
        : null,
  };
}

function settingsEqual(
  current: AdminPlatformSettings,
  next: AdminPlatformSettings,
) {
  return (
    current.platformName ===
      next.platformName &&
    current.operatingCity ===
      next.operatingCity &&
    current.supportEmail ===
      next.supportEmail &&
    current.serviceAreaDescription ===
      next.serviceAreaDescription &&
    current.timezone === next.timezone &&
    current.currencyCode ===
      next.currencyCode &&
    current.schemaVersion ===
      next.schemaVersion &&
    current.isPublic === next.isPublic
  );
}

function auditSnapshot(
  settings: AdminPlatformSettings,
) {
  return {
    platformName: settings.platformName,
    operatingCity: settings.operatingCity,
    supportEmail: settings.supportEmail,
    serviceAreaDescription:
      settings.serviceAreaDescription,

    platformCommissionRateBps:
      settings.platformCommissionRateBps,

    platformTaxStatus:
      settings.platformTaxStatus,

    platformVatRateBps:
      settings.platformVatRateBps,

    minimumDepositRateBps:
      settings.minimumDepositRateBps,

    maximumDepositRateBps:
      settings.maximumDepositRateBps,

    minimumBalanceDueDaysBeforeEvent:
      settings
        .minimumBalanceDueDaysBeforeEvent,

    maximumBalanceDueDaysBeforeEvent:
      settings
        .maximumBalanceDueDaysBeforeEvent,

    financialPolicyVersion:
      settings.financialPolicyVersion,

    timezone: settings.timezone,
    currencyCode: settings.currencyCode,
    schemaVersion: settings.schemaVersion,
    isPublic: settings.isPublic,
  };
}

function financialAuditSnapshot(
  settings: AdminPlatformSettings,
) {
  return {
    platformCommissionRateBps:
      settings
        .platformCommissionRateBps,

    platformTaxStatus:
      settings.platformTaxStatus,

    platformVatRateBps:
      settings.platformVatRateBps,

    minimumDepositRateBps:
      settings.minimumDepositRateBps,

    maximumDepositRateBps:
      settings.maximumDepositRateBps,

    minimumBalanceDueDaysBeforeEvent:
      settings
        .minimumBalanceDueDaysBeforeEvent,

    maximumBalanceDueDaysBeforeEvent:
      settings
        .maximumBalanceDueDaysBeforeEvent,

    financialPolicyVersion:
      settings
        .financialPolicyVersion,
  };
}

function storedPaymentTermPolicyOrNull(
  data: Readonly<
    Record<string, unknown>
  >,
): {
  minimumDepositRateBps: number;
  maximumDepositRateBps: number;
  minimumBalanceDueDaysBeforeEvent:
    number;
  maximumBalanceDueDaysBeforeEvent:
    number;
} | null {
  const minimumDepositRateBps =
    storedDepositPolicyRateOrNull(
      data.minimumDepositRateBps,
    );

  const maximumDepositRateBps =
    storedDepositPolicyRateOrNull(
      data.maximumDepositRateBps,
    );

  const minimumBalanceDueDaysBeforeEvent =
    storedBalancePolicyDaysOrNull(
      data
        .minimumBalanceDueDaysBeforeEvent,
    );

  const maximumBalanceDueDaysBeforeEvent =
    storedBalancePolicyDaysOrNull(
      data
        .maximumBalanceDueDaysBeforeEvent,
    );

  if (
    minimumDepositRateBps === null ||
    maximumDepositRateBps === null ||
    minimumBalanceDueDaysBeforeEvent ===
      null ||
    maximumBalanceDueDaysBeforeEvent ===
      null ||
    minimumDepositRateBps >
      maximumDepositRateBps ||
    minimumBalanceDueDaysBeforeEvent >
      maximumBalanceDueDaysBeforeEvent
  ) {
    return null;
  }

  return {
    minimumDepositRateBps,
    maximumDepositRateBps,
    minimumBalanceDueDaysBeforeEvent,
    maximumBalanceDueDaysBeforeEvent,
  };
}

function storedDepositPolicyRateOrNull(
  value: unknown,
): number | null {
  return Number.isSafeInteger(value) &&
    (value as number) > 0 &&
    (value as number) < 10_000
    ? value as number
    : null;
}

function storedBalancePolicyDaysOrNull(
  value: unknown,
): number | null {
  return Number.isSafeInteger(value) &&
    (value as number) >= 1 &&
    (value as number) <= 365
    ? value as number
    : null;
}

function storedBasisPointRateOrNull(
  value: unknown,
): number | null {
  if (
    Number.isSafeInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <=
      10_000
  ) {
    return value as number;
  }

  return null;
}

function storedBasisPointRate(
  value: unknown,
  fallback: number,
): number {
  return (
    storedBasisPointRateOrNull(
      value,
    ) ??
    fallback
  );
}

function storedPositiveIntegerOrNull(
  value: unknown,
): number | null {
  if (
    Number.isSafeInteger(value) &&
    (value as number) >= 1
  ) {
    return value as number;
  }

  return null;
}

function storedPositiveInteger(
  value: unknown,
  fallback: number,
): number {
  return (
    storedPositiveIntegerOrNull(
      value,
    ) ??
    fallback
  );
}

function storedText(
  value: unknown,
  fallback: string,
) {
  return typeof value === "string" &&
    value.trim().length > 0
    ? value.trim()
    : fallback;
}

function timestampToIsoString(
  value: unknown,
): string | null {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : null;
}
