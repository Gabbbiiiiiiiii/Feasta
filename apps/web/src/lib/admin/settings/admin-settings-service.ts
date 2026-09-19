import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import {
  FIRESTORE_COLLECTIONS,
} from "@feasta/shared-types";

import type {
  AdminPlatformSettings,
  UpdateAdminPlatformSettingsResult,
} from "@/lib/admin/settings/admin-settings-types";
import {
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
    timezone: settings.timezone,
    currencyCode: settings.currencyCode,
    schemaVersion: settings.schemaVersion,
    isPublic: settings.isPublic,
  };
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