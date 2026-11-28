import "server-only";

import {
  CANCELLATION_CUTOFF_HOURS_MAX_HARD,
  CANCELLATION_CUTOFF_HOURS_MIN_HARD,
  CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH,
  CANCELLATION_POLICY_SCHEMA_VERSION,
  CANCELLATION_POLICY_SETTINGS_DOC_ID,
  DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS,
  DEFAULT_ADMIN_CANCELLATION_MAX_HOURS,
  DEFAULT_ADMIN_CANCELLATION_MIN_HOURS,
  type AdminDefaultCancellationPolicyDto,
} from "@feasta/shared-types";
import {Timestamp} from "firebase-admin/firestore";

import {adminDb} from "@/lib/firebase/admin";

export function seededAdminCancellationPolicyDto(): AdminDefaultCancellationPolicyDto {
  return {
    policyVersion: 1,
    defaultCutoffHoursBeforeEvent: DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS,
    minCutoffHoursBeforeEvent: DEFAULT_ADMIN_CANCELLATION_MIN_HOURS,
    maxCutoffHoursBeforeEvent: DEFAULT_ADMIN_CANCELLATION_MAX_HOURS,
    guidanceNote: null,
    updatedAt: null,
    isSeededFallback: true,
  };
}

export async function getAdminDefaultCancellationPolicy(): Promise<AdminDefaultCancellationPolicyDto> {
  const snapshot = await adminDb
    .collection("appSettings")
    .doc(CANCELLATION_POLICY_SETTINGS_DOC_ID)
    .get();

  if (!snapshot.exists) {
    return seededAdminCancellationPolicyDto();
  }

  return parseAdminDefaultCancellationPolicyDto(snapshot.data());
}

export function parseAdminDefaultCancellationPolicyDto(
  data: Record<string, unknown> | undefined,
): AdminDefaultCancellationPolicyDto {
  if (!data) return seededAdminCancellationPolicyDto();

  const schemaVersion = data.schemaVersion;
  const policyVersion = data.policyVersion;
  const minHours = data.minCutoffHoursBeforeEvent;
  const maxHours = data.maxCutoffHoursBeforeEvent;
  const defaultHours = data.defaultCutoffHoursBeforeEvent;
  const guidanceNote = data.guidanceNote;

  if (
    schemaVersion !== CANCELLATION_POLICY_SCHEMA_VERSION ||
    typeof policyVersion !== "number" ||
    !Number.isSafeInteger(policyVersion) ||
    policyVersion < 1 ||
    typeof minHours !== "number" ||
    !Number.isSafeInteger(minHours) ||
    typeof maxHours !== "number" ||
    !Number.isSafeInteger(maxHours) ||
    typeof defaultHours !== "number" ||
    !Number.isSafeInteger(defaultHours) ||
    minHours < CANCELLATION_CUTOFF_HOURS_MIN_HARD ||
    maxHours > CANCELLATION_CUTOFF_HOURS_MAX_HARD ||
    minHours > defaultHours ||
    defaultHours > maxHours
  ) {
    throw new Error("Stored platform cancellation policy is invalid.");
  }

  if (
    guidanceNote !== undefined &&
    guidanceNote !== null &&
    (typeof guidanceNote !== "string" ||
      guidanceNote.length > CANCELLATION_POLICY_GUIDANCE_MAX_LENGTH)
  ) {
    throw new Error("Stored platform cancellation guidance note is invalid.");
  }

  return {
    policyVersion,
    defaultCutoffHoursBeforeEvent: defaultHours,
    minCutoffHoursBeforeEvent: minHours,
    maxCutoffHoursBeforeEvent: maxHours,
    guidanceNote: typeof guidanceNote === "string" && guidanceNote.trim()
      ? guidanceNote.trim()
      : null,
    updatedAt: data.updatedAt instanceof Timestamp
      ? data.updatedAt.toDate().toISOString()
      : null,
    isSeededFallback: false,
  };
}
