import "server-only";

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

// Read one extra record to detect overflow before trusting any acceptance evidence.
const MAX_AGREEMENT_VERIFICATIONS = 10;

export type ProviderAgreementAcceptanceSummary = {
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
    if (evidence.some((record, index) => evidence.slice(index).some((other) => acceptanceConflict(record, other)))) {
      return {...identity, snapshot: null};
    }
    return identity;
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

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stamp(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    const seconds = Math.floor(value.getTime() / 1000);
    return seconds + ":" + ((value.getTime() - seconds * 1000) * 1000000);
  }
  const timestamp = value as {seconds?: number; nanoseconds?: number};
  const nanos = timestamp.nanoseconds ?? 0;
  return typeof timestamp.seconds === "number" && Number.isInteger(timestamp.seconds) &&
    Number.isInteger(nanos) && nanos >= 0 && nanos < 1000000000
    ? timestamp.seconds + ":" + nanos : null;
}

function acceptanceConflict(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  if (a.providerAgreementAccepted === false || b.providerAgreementAccepted === false) return true;
  for (const key of ["providerAgreementVersion", "providerAgreementCode", "providerAgreementTemplateCode"]) {
    if (text(a[key]) && text(b[key]) && text(a[key]) !== text(b[key])) return true;
  }
  const aSnapshot = parseProviderAgreementSnapshot(a.providerAgreementSnapshot);
  const bSnapshot = parseProviderAgreementSnapshot(b.providerAgreementSnapshot);
  const aVersion = text(a.providerAgreementVersion) || aSnapshot?.version;
  const bVersion = text(b.providerAgreementVersion) || bSnapshot?.version;
  const aCode = text(a.providerAgreementCode) || aSnapshot?.code;
  const bCode = text(b.providerAgreementCode) || bSnapshot?.code;
  if ((aVersion && bVersion && aVersion !== bVersion) || (aCode && bCode && aCode !== bCode)) return true;
  const left = stamp(a.providerAgreementAcceptedAt ?? aSnapshot?.acceptedAt);
  const right = stamp(b.providerAgreementAcceptedAt ?? bSnapshot?.acceptedAt);
  if (left && right && left !== right) return true;
  for (const record of [a, b]) {
    if ((record.providerAgreementAccepted != null && typeof record.providerAgreementAccepted !== "boolean") ||
      (record.providerAgreementAcceptedAt != null && stamp(record.providerAgreementAcceptedAt) === null)) return true;
    for (const key of ["providerAgreementVersion", "providerAgreementCode", "providerAgreementTemplateCode"]) {
      if (record[key] != null && !text(record[key])) return true;
    }
  }
  // Contradictory or malformed secondary evidence cannot authorize recovery.
  for (const record of [a, b]) {
    if (record.providerAgreementSnapshot == null) continue;
    const snapshot = parseProviderAgreementSnapshot(record.providerAgreementSnapshot);
    if (!snapshot || (snapshot.acceptedAt != null && stamp(snapshot.acceptedAt) === null) || (text(record.providerAgreementVersion) && snapshot.version !== text(record.providerAgreementVersion)) ||
      (text(record.providerAgreementCode) && snapshot.code !== text(record.providerAgreementCode)) ||
      (text(record.providerAgreementTemplateCode) && snapshot.code !== text(record.providerAgreementTemplateCode)) ||
      (snapshot.acceptedAt != null && record.providerAgreementAcceptedAt != null && stamp(snapshot.acceptedAt) !== stamp(record.providerAgreementAcceptedAt))) return true;
  }
  const first = parseProviderAgreementSnapshot(a.providerAgreementSnapshot);
  const second = parseProviderAgreementSnapshot(b.providerAgreementSnapshot);
  return Boolean(first && second && JSON.stringify({...first, acceptedAt: undefined}) !== JSON.stringify({...second, acceptedAt: undefined}));
}
function hasAgreementEvidence(record: Record<string, unknown>): boolean {
  return Object.keys(record).some((key) => key.startsWith("providerAgreement") && record[key] != null);
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
