import "server-only";
import {createHash} from "node:crypto";

import {getPublishedProviderAgreement} from "@/lib/documents/document-catalog-service";
import {adminDb} from "@/lib/firebase/admin";
import {renderProviderAgreementPdf} from "@/lib/provider/provider-agreement-pdf";
import {
  authorizedRepresentativeName,
  formatTrustedAcceptanceTimestamp,
  parseProviderAgreementSnapshot,
  selectProviderAgreementPdf,
  type ProviderAgreementSnapshot,
} from "@/lib/provider/provider-agreement-record";

export type ProviderAgreementAcceptanceSummary = {
  history?: {acceptedVersion: string; acceptedAtLabel: string | null; snapshot: ProviderAgreementSnapshot | null}[];
  accepted: boolean;
  acceptedVersion: string;
  acceptedAtLabel: string | null;
  businessName: string;
  representativeName: string;
  snapshot: ProviderAgreementSnapshot | null;
};

export async function loadProviderAgreementAcceptanceSummary(input: {
  uid: string;
  providerId: string | null;
}): Promise<ProviderAgreementAcceptanceSummary | null> {
  const identity = await loadProviderAgreementIdentity(input);
  if (!identity) return null;
  return {
    businessName: identity.businessName,
    representativeName: identity.representativeName,
    snapshot: identity.snapshot,
    accepted: identity.accepted,
    acceptedVersion: identity.acceptedVersion,
    acceptedAtLabel: identity.acceptedAtLabel,
    history: identity.history,
  };
}

export async function loadProviderAgreementPdfDocument(input: {
  uid: string;
  providerId: string | null;
  copy: "current" | "accepted";
}): Promise<{bytes: Uint8Array; version: string} | null> {
  const identity = await loadProviderAgreementIdentity(input);
  if (!identity) return null;
  if (input.copy === "accepted" && (!identity.accepted || !identity.snapshot ||
    (identity.acceptedVersion && identity.snapshot.version !== identity.acceptedVersion))) {
    return null;
  }
  // Accepted downloads use only the owned historical snapshot, never today's text.
  const current = input.copy === "current" ? await getPublishedProviderAgreement() : null;
  const model = selectProviderAgreementPdf({
    copy: input.copy,
    current: current
      ? {
          name: current.name,
          version: current.version,
          effectiveDate: current.effectiveDate,
          sections: current.sections,
        }
      : null,
    accepted: identity.snapshot
      ? {
          snapshot: identity.snapshot,
          businessName: identity.businessName,
          representativeName: identity.representativeName,
          providerId: identity.providerId,
        }
      : null,
  });
  if (!model) return null;
  return {
    bytes: await renderProviderAgreementPdf(model),
    version: model.version,
  };
}

async function loadProviderAgreementIdentity(input: {
  uid: string;
  providerId: string | null;
}): Promise<{
  accepted: boolean;
  acceptedVersion: string;
  acceptedAtLabel: string | null;
  businessName: string;
  representativeName: string;
  providerId: string | null;
  snapshot: ProviderAgreementSnapshot | null;
  history?: {acceptedVersion: string; acceptedAtLabel: string | null; snapshot: ProviderAgreementSnapshot | null}[];
} | null> {
  if (input.providerId) {
    const providerSnapshot = await adminDb
      .collection("providers")
      .doc(input.providerId)
      .get();
    const provider = providerSnapshot.data();
    if (!provider || provider.ownerId !== input.uid ||
      (provider.providerId != null && provider.providerId !== input.providerId)) {
      return null;
    }
    const verificationSnapshot = await adminDb
      .collection("providerVerifications")
      .where("providerId", "==", input.providerId)
      .limit(MAX_AGREEMENT_VERIFICATIONS + 1)
      .get();
    if (verificationSnapshot.size > MAX_AGREEMENT_VERIFICATIONS) return null;
    const records = verificationSnapshot.docs.map((document) => document.data());
    if (records.some((record) => record.ownerId !== input.uid || record.providerId !== input.providerId)) return null;
    const evidence = [...records, provider].filter(hasAgreementEvidence);
    // Rank complete evidence first, then use a stable key; query order is never authoritative.
    const ranked = evidence.map((record) => ({
      identity: identityFromRecord(provider, record, input.providerId),
      rank: evidenceRank(record),
      key: evidenceKey(record),
    })).sort((a, b) => b.rank - a.rank || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const identity = ranked[0]?.identity ?? identityFromRecord(provider, undefined, input.providerId);
    // Compare every pair, including weak metadata that may contradict stronger evidence.
    if (legacyEvidenceConflict(evidence)) {
      if (provider.providerAgreementCurrentAcceptanceId != null) return null;
      return loadVoluntaryAcceptances(provider, {...identity, snapshot: null}, input.uid, evidence);
    }
    return loadVoluntaryAcceptances(provider, identity, input.uid, evidence);
  }

  const draftSnapshot = await adminDb
    .collection("providerOnboardingDrafts")
    .doc(input.uid)
    .get();
  return identityFromRecord(draftSnapshot.data() ?? {}, undefined, null);
}

function identityFromRecord(
  profile: Record<string, unknown>,
  acceptanceSource: Record<string, unknown> | undefined,
  providerId: string | null,
): {
  acceptedAt: unknown;
  accepted: boolean;
  acceptedVersion: string;
  acceptedAtLabel: string | null;
  businessName: string;
  representativeName: string;
  providerId: string | null;
  snapshot: ProviderAgreementSnapshot | null;
} {
  const source = acceptanceSource ?? profile;
  let snapshot = parseProviderAgreementSnapshot(
    source.providerAgreementSnapshot,
  );
  if (snapshot && (
    (text(source.providerAgreementVersion) && snapshot.version !== text(source.providerAgreementVersion)) ||
    (text(source.providerAgreementCode) && snapshot.code !== text(source.providerAgreementCode)) ||
    (text(source.providerAgreementTemplateCode) && snapshot.code !== text(source.providerAgreementTemplateCode)) ||
    source.providerAgreementAccepted === false ||
    (snapshot.acceptedAt != null && source.providerAgreementAcceptedAt != null && stamp(snapshot.acceptedAt) !== stamp(source.providerAgreementAcceptedAt))
  )) snapshot = null;
  if (snapshot && snapshot.acceptedAt == null && source.providerAgreementAcceptedAt != null) {
    snapshot.acceptedAt = source.providerAgreementAcceptedAt;
  }
  return {
    acceptedAt: source.providerAgreementAcceptedAt ?? snapshot?.acceptedAt,
    accepted: source.providerAgreementAccepted === true ||
      source.providerAgreementAcceptedAt != null || snapshot !== null,
    acceptedVersion: text(source.providerAgreementVersion) || snapshot?.version || "",
    acceptedAtLabel: formatTrustedAcceptanceTimestamp(
      source.providerAgreementAcceptedAt ?? snapshot?.acceptedAt,
    ),
    businessName: text(profile.businessName),
    representativeName: authorizedRepresentativeName(
      text(profile.ownerFirstName),
      text(profile.ownerLastName),
    ),
    providerId,
    snapshot,
  };
}

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

// Legacy verification evidence still describes ONE acceptance and uses all the
// original conflict checks. Only the server-created chain denotes later events.
async function loadVoluntaryAcceptances(
  provider: Record<string, unknown>,
  legacy: ReturnType<typeof identityFromRecord>,
  uid: string,
  evidence: Record<string, unknown>[],
) {
  let id = provider.providerAgreementCurrentAcceptanceId;
  if (id == null) return legacy;
  const history: ReturnType<typeof identityFromRecord>[] = [];
  const seen = new Set<string>();
  const versions = new Set<string>();
  let current: ReturnType<typeof identityFromRecord> | null = null;
  while (id != null) {
    if (typeof id !== "string" || !/^[a-f0-9]{64}$/u.test(id) || seen.has(id) || seen.size >= MAX_AGREEMENT_HISTORY) return null;
    seen.add(id);
    const record = (await adminDb.collection("providerAgreementAcceptances").doc(id).get()).data();
    if (!record || !legacy.providerId ||
      !validAcceptanceEvent(id, record, uid, legacy.providerId, evidence)) return null;
    const snapshot = parseProviderAgreementSnapshot(record.snapshot)!;
    if (versions.has(snapshot.version)) return null;
    versions.add(snapshot.version);
    const entry = {
      ...legacy, accepted: true, acceptedVersion: snapshot.version, acceptedAt: record.acceptedAt,
      acceptedAtLabel: formatTrustedAcceptanceTimestamp(record.acceptedAt), snapshot,
      businessName: text(record.businessName), representativeName: text(record.representativeName),
    };
    if (!current) current = entry;
    else history.push(entry);
    id = record.previousAcceptanceId;
  }
  if (legacy.accepted) history.push(legacy);
  return current ? {...current, history} : null;
}

function evidenceRank(record: Record<string, unknown>): number {
  const snapshot = identityFromRecord({}, record, null).snapshot;
  const complete = record.providerAgreementAccepted === true &&
    Boolean(text(record.providerAgreementVersion)) && Boolean(text(record.providerAgreementCode)) &&
    stamp(record.providerAgreementAcceptedAt) !== null;
  if (snapshot && complete) return 4;
  if (snapshot) return 3; // Preserve legacy stored snapshots without inventing missing metadata.
  if (record.providerAgreementAccepted === true || stamp(record.providerAgreementAcceptedAt) !== null) return 2;
  return 1;
}

function evidenceKey(record: Record<string, unknown>): string {
  const identity = identityFromRecord({}, record, null);
  return JSON.stringify([identity.acceptedVersion, identity.acceptedAtLabel, identity.accepted,
    identity.snapshot, text(record.providerAgreementCode), text(record.providerAgreementTemplateCode)]);
}
