import {FieldValue, type Firestore, type Transaction} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

export const MAINTENANCE_PATH = "maintenanceControls/intake";
export type MaintenanceScope = "intake" | "publication";
export interface MaintenanceControl {
  schemaVersion: 1;
  revision: number;
  intake: boolean;
  publication: boolean;
}
// true means PAUSED. No cache, environment bypass, automatic expiry or catalog mutation.
export function parseMaintenance(value: unknown): MaintenanceControl | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== 1 || !Number.isSafeInteger(v.revision) ||
      (v.revision as number) < 1 || typeof v.intake !== "boolean" ||
      typeof v.publication !== "boolean" || (v.publication && !v.intake)) return null;
  return v as unknown as MaintenanceControl;
}
export async function maintenanceOpen(tx: Transaction, db: Firestore,
  scope: MaintenanceScope): Promise<boolean> {
  const control = parseMaintenance((await tx.get(db.doc(MAINTENANCE_PATH))).data());
  return control !== null && control[scope] === false;
}
export async function requireMaintenanceOpen(tx: Transaction, db: Firestore,
  scope: MaintenanceScope): Promise<void> {
  if (!await maintenanceOpen(tx, db, scope)) {
    throw new HttpsError("unavailable", "New intake or publication is paused.",
      {reason: "MAINTENANCE_PAUSED", scope});
  }
}

// Call AFTER all reads, before commit, and only after requireMaintenanceOpen.
// Explicit shared write serializes admissions with activation, including preparation.
export function recordMaintenanceAdmission(tx: Transaction, db: Firestore): void {
  tx.update(db.doc(MAINTENANCE_PATH), {lastAdmissionAt: FieldValue.serverTimestamp()});
}
