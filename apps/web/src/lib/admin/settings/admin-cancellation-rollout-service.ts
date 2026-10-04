import "server-only";

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

import {FIRESTORE_COLLECTIONS} from "@feasta/shared-types";

import type {
  AdminCancellationRolloutSettings,
  UpdateAdminCancellationRolloutResult,
} from "@/lib/admin/settings/admin-settings-types";
import {
  validateAdminCancellationRolloutUpdate,
} from "@/lib/admin/settings/admin-settings-validation";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const CANCELLATION_ROLLOUT_DOCUMENT =
  "cancellationRefundRollout";

const ADMIN_LOGS_COLLECTION =
  "adminLogs";

const defaultCancellationRollout:
  AdminCancellationRolloutSettings = {
    customerCancellationMode: "off",
    automaticPolicyRefundApprovalMode: "off",
    schemaVersion: 1,
    isPublic: false,
    updatedAt: null,
    updatedBy: null,
  };

export async function getAdminCancellationRollout():
Promise<AdminCancellationRolloutSettings> {
  await requireAdmin();

  const snapshot =
    await cancellationRolloutReference()
      .get();

  return mapCancellationRollout(snapshot);
}

export async function updateAdminCancellationRollout(
  input: unknown,
): Promise<UpdateAdminCancellationRolloutResult> {
  const administrator =
    await requireAdmin();

  const update =
    validateAdminCancellationRolloutUpdate(
      input,
    );

  const settingsReference =
    cancellationRolloutReference();

  const changed =
    await adminDb.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(
            settingsReference,
          );

        const current =
          mapCancellationRollout(
            snapshot,
          );

        const next:
          AdminCancellationRolloutSettings = {
            customerCancellationMode:
              update.customerCancellationMode,

            automaticPolicyRefundApprovalMode:
              update
                .automaticPolicyRefundApprovalMode,

            schemaVersion: 1,
            isPublic: false,

            updatedAt:
              current.updatedAt,

            updatedBy:
              administrator.uid,
          };

        if (
          snapshot.exists &&
          isCanonicalStoredRollout(snapshot.data() ?? {}) &&
          rolloutEqual(
            current,
            next,
          )
        ) {
          return false;
        }

        const timestamp =
          FieldValue.serverTimestamp();

        const storedSettings = {
          customerCancellationMode:
            next.customerCancellationMode,

          automaticPolicyRefundApprovalMode:
            next
              .automaticPolicyRefundApprovalMode,

          schemaVersion: 1,
          isPublic: false,

          updatedAt:
            timestamp,

          updatedBy:
            administrator.uid,
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
              snapshot.exists
                ? "cancellation_rollout_updated"
                : "cancellation_rollout_created",

            description:
              snapshot.exists
                ? "Updated the customer cancellation rollout."
                : "Created the customer cancellation rollout.",

            targetCollection:
              FIRESTORE_COLLECTIONS
                .appSettings,

            targetId:
              CANCELLATION_ROLLOUT_DOCUMENT,

            source:
              "web_admin",

            reason:
              update.internalReason,

            before:
              snapshot.exists
                ? storedRolloutAuditSnapshot(snapshot.data() ?? {})
                : null,

            after:
              rolloutAuditSnapshot(
                next,
              ),

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
      mapCancellationRollout(
        savedSnapshot,
      ),

    changed,
  };
}

function cancellationRolloutReference() {
  return adminDb
    .collection(
      FIRESTORE_COLLECTIONS.appSettings,
    )
    .doc(
      CANCELLATION_ROLLOUT_DOCUMENT,
    );
}

function mapCancellationRollout(
  snapshot: DocumentSnapshot<DocumentData>,
): AdminCancellationRolloutSettings {
  if (!snapshot.exists) {
    return defaultCancellationRollout;
  }

  const data =
    snapshot.data() ?? {};

  const customerCancellationMode =
    data.customerCancellationMode;

  const automaticPolicyRefundApprovalMode =
    data.automaticPolicyRefundApprovalMode;

  const validCustomerMode =
    customerCancellationMode === "off" ||
    customerCancellationMode ===
      "review_only" ||
    customerCancellationMode ===
      "enabled";

  const validAutomaticMode =
    automaticPolicyRefundApprovalMode ===
      "off" ||
    automaticPolicyRefundApprovalMode ===
      "enabled";

  const safeCombination =
    automaticPolicyRefundApprovalMode !==
      "enabled" ||
    customerCancellationMode ===
      "enabled";

  if (
    data.schemaVersion !== 1 ||
    data.isPublic !== false ||
    !validCustomerMode ||
    !validAutomaticMode ||
    !safeCombination
  ) {
    return defaultCancellationRollout;
  }

  return {
    customerCancellationMode,

    automaticPolicyRefundApprovalMode,

    schemaVersion: 1,
    isPublic: false,

    updatedAt:
      timestampToIsoString(
        data.updatedAt,
      ),

    updatedBy:
      typeof data.updatedBy === "string"
        ? data.updatedBy
        : null,
  };
}

function rolloutEqual(
  current:
    AdminCancellationRolloutSettings,
  next:
    AdminCancellationRolloutSettings,
) {
  return (
    current.customerCancellationMode ===
      next.customerCancellationMode &&
    current
      .automaticPolicyRefundApprovalMode ===
      next
        .automaticPolicyRefundApprovalMode &&
    current.schemaVersion ===
      next.schemaVersion &&
    current.isPublic ===
      next.isPublic
  );
}

function rolloutAuditSnapshot(
  settings:
    AdminCancellationRolloutSettings,
) {
  return {
    customerCancellationMode:
      settings.customerCancellationMode,

    automaticPolicyRefundApprovalMode:
      settings
        .automaticPolicyRefundApprovalMode,

    schemaVersion:
      settings.schemaVersion,

    isPublic:
      settings.isPublic,
  };
}

function timestampToIsoString(
  value: unknown,
): string | null {
  return value instanceof Timestamp
    ? value.toDate().toISOString()
    : null;
}

// Display defaults are never evidence that a valid document is stored.
function isCanonicalStoredRollout(data: DocumentData): boolean {
  return data.schemaVersion === 1 && data.isPublic === false &&
    ["off", "review_only", "enabled"].includes(data.customerCancellationMode) &&
    ["off", "enabled"].includes(data.automaticPolicyRefundApprovalMode) &&
    (data.automaticPolicyRefundApprovalMode !== "enabled" ||
      data.customerCancellationMode === "enabled") &&
    data.updatedAt instanceof Timestamp &&
    typeof data.updatedBy === "string" && data.updatedBy.trim().length > 0;
}

function storedRolloutAuditSnapshot(data: DocumentData) {
  // Bound configuration primitives; do not copy arbitrary malformed payloads.
  const scalar = (value: unknown) =>
    typeof value === "boolean" || typeof value === "number" ? value :
      typeof value === "string" ? value.slice(0, 100) : null;
  return {
    customerCancellationMode: scalar(data.customerCancellationMode),
    automaticPolicyRefundApprovalMode: scalar(data.automaticPolicyRefundApprovalMode),
    schemaVersion: scalar(data.schemaVersion),
    isPublic: scalar(data.isPublic),
  };
}
