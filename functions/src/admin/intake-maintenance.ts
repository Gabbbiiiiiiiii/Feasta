import {createHash} from "node:crypto";
import {Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {resolveBackendAccountState} from "../shared/account-state.js";
import {requireRecentAuthentication} from "../shared/recent-auth.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {db} from "../shared/firestore.js";
import {MAINTENANCE_PATH, parseMaintenance} from "../shared/maintenance.js";

export const setIntakeMaintenance = onCall(appCheckCallableOptions, async (request) => {
  const {uid} = requireAuth(request);
  await requireRole(uid, ["admin"]);
  requireRecentAuthentication(request.auth?.token.auth_time);
  await enforceCallableRateLimit(request,
    {scope: "maintenance.set", limit: 30, windowSeconds: 3600});
  const v = request.data;
  const fields = ["expectedRevision", "intake", "publication", "reason", "operationKey"];
  if (!v || typeof v !== "object" || Array.isArray(v) ||
      Object.keys(v).some(k => !fields.includes(k)) ||
      fields.some(k => !Object.hasOwn(v, k)) ||
      !Number.isSafeInteger(v.expectedRevision) || v.expectedRevision < 0 ||
      typeof v.intake !== "boolean" || typeof v.publication !== "boolean" ||
      typeof v.reason !== "string" || v.reason.trim().length < 10 || v.reason.length > 500 ||
      typeof v.operationKey !== "string" || !/^[a-zA-Z0-9_-]{16,128}$/u.test(v.operationKey)) {
    throw new HttpsError("invalid-argument", "Invalid maintenance operation.");
  }
  const fingerprint = JSON.stringify([v.expectedRevision, v.intake, v.publication, v.reason]);
  const id = createHash("sha256").update(uid + ":" + v.operationKey).digest("hex");
  const audit = db.collection("maintenanceAudits").doc(id);
  return db.runTransaction(async tx => {
    const user = (await tx.get(db.collection("users").doc(uid))).data();
    if (resolveBackendAccountState({authDisabled: false, profile: user,
      allowedRoles: ["admin"]}).kind !== "active") {
      throw new HttpsError("permission-denied", "Active administrator required.");
    }
    const previous = (await tx.get(audit)).data();
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        throw new HttpsError("already-exists", "Operation key already used.");
      }
      return previous.result; // Never repeat a state change on replay.
    }
    const ref = db.doc(MAINTENANCE_PATH);
    const snapshot = await tx.get(ref);
    const before = parseMaintenance(snapshot.data());
    if (snapshot.exists && !before) {
      throw new HttpsError("failed-precondition",
        "Malformed maintenance control; keep intake closed.");
    }
    if ((before?.revision ?? 0) !== v.expectedRevision ||
        v.expectedRevision >= Number.MAX_SAFE_INTEGER) {
      throw new HttpsError("aborted", "Maintenance revision changed.");
    }
    // Bootstrap can only establish a pause. Reopening is a separate reviewed operation.
    if (!before && (!v.intake || !v.publication)) {
      throw new HttpsError("failed-precondition", "Initialize both scopes paused.");
    }
    // Publication is reopened first, intake last; closing publication closes intake too.
    if (v.publication && !v.intake) {
      throw new HttpsError("failed-precondition",
        "Intake must remain paused while publication is paused.");
    }
    const result = {schemaVersion: 1, operationId: id, revision: v.expectedRevision + 1,
      intake: v.intake, publication: v.publication};
    const now = Timestamp.now();
    tx.set(ref, {...result, actorUid: uid, reason: v.reason.trim(), updatedAt: now});
    tx.create(audit, {actorUid: uid, fingerprint, before: before ?? null, result,
      reason: v.reason.trim(), createdAt: now});
    return result;
  });
});

export const inspectIntakeMaintenance = onCall(appCheckCallableOptions, async (request) => {
  const {uid} = requireAuth(request);
  await requireRole(uid, ["admin"]);
  await enforceCallableRateLimit(request,
    {scope: "maintenance.inspect", limit: 60, windowSeconds: 3600});
  const control = parseMaintenance((await db.doc(MAINTENANCE_PATH).get()).data());
  return control ? {available: true, ...control} :
    {available: false, revision: null, intake: true, publication: true};
});
