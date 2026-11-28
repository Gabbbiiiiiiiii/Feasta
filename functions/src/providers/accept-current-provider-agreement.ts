import {createHash} from "node:crypto";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {writeAuditLogInTransaction} from "../shared/audit.js";
import {AGREEMENT_TYPES} from "../shared/agreement-types.js";
import {
  isApprovedProviderForOperations, isProviderOwnerAccountActive, USER_ROLES,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {resolvePublishedLegalAgreement} from "../shared/published-legal-agreement.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {parseProviderAgreementSnapshot} from "../shared/provider-agreement-acceptance.js";

// The review digest binds confirmation to every byte of the displayed document.
export function agreementReviewDigest(agreement: unknown): string {
  return createHash("sha256").update(JSON.stringify(agreement)).digest("hex");
}

export const acceptCurrentProviderAgreement = onCall(appCheckCallableOptions, async (request) => {
  const actor = requireAuth(request);
  await requireRole(actor.uid, [USER_ROLES.provider]);
  await enforceCallableRateLimit(request, {
    scope: "providerAgreement.reviewOrAccept", limit: 30, windowSeconds: 600,
  });
  const input = request.data ?? {};
  if (input.action !== "review" && input.action !== "accept") {
    throw new HttpsError("invalid-argument", "Choose review or accept.");
  }
  const userRef = db.collection("users").doc(actor.uid);
  return db.runTransaction(async (transaction) => {
    const user = (await transaction.get(userRef)).data() ?? {};
    const providerId = user.providerId;
    if (typeof providerId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(providerId)) {
      throw new HttpsError("permission-denied", "Provider account is not linked.");
    }
    const providerRef = db.collection("providers").doc(providerId);
    const provider = (await transaction.get(providerRef)).data() ?? {};
    if (!isProviderOwnerAccountActive(providerId, user) || provider.ownerId !== actor.uid ||
      (provider.providerId != null && provider.providerId !== providerId) ||
      !isApprovedProviderForOperations(provider)) {
      throw new HttpsError("permission-denied", "An active approved provider owner is required.");
    }
    const types = await transaction.get(db.collection(AGREEMENT_TYPES));
    const templates = await transaction.get(db.collection("agreementTemplates"));
    const agreement = resolvePublishedLegalAgreement("provider_onboarding", types, templates);
    if (!agreement || !parseProviderAgreementSnapshot(agreement)) {
      throw new HttpsError("failed-precondition",
        "The published Provider Agreement is unavailable.");
    }
    const digest = agreementReviewDigest(agreement);
    if (input.action === "review") return {agreement, digest};
    if (input.confirmed !== true || input.version !== agreement.version ||
      input.digest !== digest) {
      throw new HttpsError("failed-precondition",
        "The agreement changed. Review the current agreement again.");
    }
    // One immutable acceptance per provider/document version. Replays, including
    // concurrent requests, cannot change its date, body, or the current pointer.
    const acceptanceId = agreementReviewDigest([providerId, agreement.code, agreement.version]);
    const ref = db.collection("providerAgreementAcceptances").doc(acceptanceId);
    const existing = await transaction.get(ref);
    // Validate legacy evidence and the entire chain even for an idempotent replay.
    const verifications = await transaction.get(
      db.collection("providerVerifications").where("providerId", "==", providerId)
        .limit(MAX_AGREEMENT_VERIFICATIONS + 1),
    );
    if (verifications.docs.length > MAX_AGREEMENT_VERIFICATIONS) {
      throw new HttpsError("failed-precondition", "Too many agreement verification records.");
    }
    const verificationRecords = verifications.docs.map((doc) => doc.data());
    if (verificationRecords.some((record) =>
      record.ownerId !== actor.uid || record.providerId !== providerId,
    )) {
      throw new HttpsError("permission-denied", "Verification ownership could not be verified.");
    }
    const legacy = [provider, ...verificationRecords].filter(hasAgreementEvidence);
    if (legacyEvidenceConflict(legacy)) {
      throw new HttpsError("failed-precondition", "Conflicting legacy agreement evidence.");
    }
    let previousId = provider.providerAgreementCurrentAcceptanceId;
    const seen = new Set<string>();
    const versions = new Set<string>();
    while (previousId != null) {
      if (typeof previousId !== "string" || !/^[a-f0-9]{64}$/u.test(previousId) ||
        seen.has(previousId) || seen.size >= MAX_AGREEMENT_HISTORY) {
        throw new HttpsError("failed-precondition", "Invalid or excessive agreement history.");
      }
      seen.add(previousId);
      const previous = (await transaction.get(
        db.collection("providerAgreementAcceptances").doc(previousId),
      )).data();
      if (!previous || !validAcceptanceEvent(previousId, previous, actor.uid, providerId, legacy)) {
        throw new HttpsError("failed-precondition", "Agreement history requires support review.");
      }
      const snapshot = parseProviderAgreementSnapshot(previous.snapshot)!;
      if (versions.has(snapshot.version)) {
        throw new HttpsError("failed-precondition", "Duplicate agreement versions in history.");
      }
      versions.add(snapshot.version);
      previousId = previous.previousAcceptanceId;
    }
    if (existing.exists) {
      if (existing.data()?.digest !== digest ||
        provider.providerAgreementCurrentAcceptanceId !== acceptanceId) {
        throw new HttpsError("failed-precondition",
          "Conflicting acceptance evidence requires support review.");
      }
      return {acceptanceId, recorded: false};
    }
    if (seen.size >= MAX_AGREEMENT_HISTORY || versions.has(agreement.version)) {
      throw new HttpsError("failed-precondition", "Agreement history cannot be extended.");
    }
    if (legacy.some((record) => (text(record.providerAgreementVersion) ||
      parseProviderAgreementSnapshot(record.providerAgreementSnapshot)?.version) ===
        agreement.version &&
      (record.providerAgreementAccepted === true || record.providerAgreementAcceptedAt != null ||
        record.providerAgreementSnapshot != null))) {
      throw new HttpsError("failed-precondition",
        "This agreement version is already accepted in your original record.");
    }
    const acceptedAt = serverTimestamp();
    transaction.create(ref, {
      ownerId: actor.uid, providerId, digest,
      previousAcceptanceId: provider.providerAgreementCurrentAcceptanceId ?? null,
      snapshot: {...agreement, acceptedAt},
      businessName: provider.businessName ?? "",
      representativeName: [provider.ownerFirstName, provider.ownerLastName]
        .filter(Boolean).join(" "),
      acceptedAt, source: "business_profile_explicit_confirmation",
    });
    transaction.update(providerRef, {providerAgreementCurrentAcceptanceId: acceptanceId});
    writeAuditLogInTransaction(transaction, {
      actorId: actor.uid, actorRole: USER_ROLES.provider,
      action: "provider.agreement_accepted", targetCollection: "providerAgreementAcceptances",
      targetId: acceptanceId, metadata: {providerId, version: agreement.version, digest},
    });
    return {acceptanceId, recorded: true};
  });
});

// BEGIN acceptance history policy (kept identical in Web and Functions by regression test).
const MAX_AGREEMENT_VERIFICATIONS = 10;
const MAX_AGREEMENT_HISTORY = 100;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stamp(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    const seconds = Math.floor(value.getTime() / 1000);
    return stamp({seconds, nanoseconds: (value.getTime() - seconds * 1000) * 1000000});
  }
  const timestamp = value as {seconds?: number; nanoseconds?: number};
  const nanos = timestamp.nanoseconds ?? 0;
  return typeof timestamp.seconds === "number" && Number.isInteger(timestamp.seconds) &&
    timestamp.seconds >= -62135596800 && timestamp.seconds <= 253402300799 &&
    Number.isInteger(nanos) && nanos >= 0 && nanos < 1000000000
    ? timestamp.seconds + ":" + nanos : null;
}

function acceptanceConflict(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a.providerAgreementAccepted === false || b.providerAgreementAccepted === false) return true;
  const fields = [
    "providerAgreementVersion", "providerAgreementCode", "providerAgreementTemplateCode",
  ];
  for (const key of fields) {
    if (text(a[key]) && text(b[key]) && text(a[key]) !== text(b[key])) return true;
  }
  const aSnapshot = parseProviderAgreementSnapshot(a.providerAgreementSnapshot);
  const bSnapshot = parseProviderAgreementSnapshot(b.providerAgreementSnapshot);
  const aVersion = text(a.providerAgreementVersion) || aSnapshot?.version;
  const bVersion = text(b.providerAgreementVersion) || bSnapshot?.version;
  const aCode = text(a.providerAgreementCode) || aSnapshot?.code;
  const bCode = text(b.providerAgreementCode) || bSnapshot?.code;
  if ((aVersion && bVersion && aVersion !== bVersion) ||
    (aCode && bCode && aCode !== bCode)) return true;
  const left = stamp(a.providerAgreementAcceptedAt ?? aSnapshot?.acceptedAt);
  const right = stamp(b.providerAgreementAcceptedAt ?? bSnapshot?.acceptedAt);
  if (left && right && left !== right) return true;
  for (const record of [a, b]) {
    if ((record.providerAgreementAccepted != null &&
      typeof record.providerAgreementAccepted !== "boolean") ||
      (record.providerAgreementAcceptedAt != null &&
        stamp(record.providerAgreementAcceptedAt) === null)) return true;
    for (const key of fields) {
      if (record[key] != null && !text(record[key])) return true;
    }
  }
  // Contradictory or malformed secondary evidence cannot authorize recovery.
  for (const record of [a, b]) {
    if (record.providerAgreementSnapshot == null) continue;
    const snapshot = parseProviderAgreementSnapshot(record.providerAgreementSnapshot);
    if (!snapshot ||
      (snapshot.acceptedAt != null && stamp(snapshot.acceptedAt) === null) ||
      (text(record.providerAgreementVersion) &&
        snapshot.version !== text(record.providerAgreementVersion)) ||
      (text(record.providerAgreementCode) &&
        snapshot.code !== text(record.providerAgreementCode)) ||
      (text(record.providerAgreementTemplateCode) &&
        snapshot.code !== text(record.providerAgreementTemplateCode)) ||
      (snapshot.acceptedAt != null && record.providerAgreementAcceptedAt != null &&
        stamp(snapshot.acceptedAt) !== stamp(record.providerAgreementAcceptedAt))) return true;
  }
  const first = parseProviderAgreementSnapshot(a.providerAgreementSnapshot);
  const second = parseProviderAgreementSnapshot(b.providerAgreementSnapshot);
  return Boolean(first && second &&
    JSON.stringify({...first, acceptedAt: undefined}) !==
      JSON.stringify({...second, acceptedAt: undefined}));
}
function hasAgreementEvidence(record: Record<string, unknown>): boolean {
  return Object.keys(record).some((key) => key.startsWith("providerAgreement") &&
    key !== "providerAgreementCurrentAcceptanceId" && record[key] != null);
}

function legacyEvidenceConflict(evidence: Record<string, unknown>[]): boolean {
  return evidence.some((record, index) =>
    evidence.slice(index).some((other) => acceptanceConflict(record, other)),
  );
}

function validAcceptanceEvent(
  id: string,
  record: Record<string, unknown> | undefined,
  uid: string,
  providerId: string,
  evidence: Record<string, unknown>[],
): boolean {
  const snapshot = parseProviderAgreementSnapshot(record?.snapshot);
  if (!record || record.ownerId !== uid || record.providerId !== providerId ||
    !snapshot || !stamp(record.acceptedAt) ||
    stamp(snapshot.acceptedAt) !== stamp(record.acceptedAt)) return false;
  if (record.previousAcceptanceId !== null &&
    (typeof record.previousAcceptanceId !== "string" ||
      !/^[a-f0-9]{64}$/u.test(record.previousAcceptanceId))) return false;
  const raw = record.snapshot as Record<string, unknown>;
  if (typeof raw.summary !== "string") return false;
  const hash = (value: unknown) => createHash("sha256")
    .update(JSON.stringify(value)).digest("hex");
  if (id !== hash([providerId, snapshot.code, snapshot.version]) ||
    record.digest !== hash({code: snapshot.code, name: snapshot.name, summary: raw.summary,
      version: snapshot.version, effectiveDate: snapshot.effectiveDate,
      sections: snapshot.sections})) return false;
  const eventEvidence = {
    providerAgreementAccepted: true,
    providerAgreementVersion: snapshot.version,
    providerAgreementSnapshot: snapshot,
    providerAgreementAcceptedAt: record.acceptedAt,
  };
  return evidence.every((legacy) => {
    const version = text(legacy.providerAgreementVersion) ||
      parseProviderAgreementSnapshot(legacy.providerAgreementSnapshot)?.version;
    return version !== snapshot.version || !acceptanceConflict(legacy, eventEvidence);
  });
}
// END acceptance history policy.
