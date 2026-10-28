import "server-only";
import {FieldValue, type Transaction} from "firebase-admin/firestore";
import {adminDb} from "./admin";

// Wire contract shared with Functions maintenanceControls/intake. No client setting.
export async function requirePublicationOpen(tx: Transaction): Promise<void> {
  const v = (await tx.get(adminDb.doc("maintenanceControls/intake"))).data();
  if (!v || v.schemaVersion !== 1 || !Number.isSafeInteger(v.revision) || v.revision < 1 ||
      typeof v.intake !== "boolean" || v.publication !== false) {
    throw new Error("Publication is paused or maintenance configuration is unavailable.");
  }
}

export function recordPublicationAdmission(tx: Transaction): void {
  tx.update(adminDb.doc("maintenanceControls/intake"), {lastAdmissionAt: FieldValue.serverTimestamp()});
}
