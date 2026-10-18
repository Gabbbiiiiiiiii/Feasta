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
    if (!provider || provider.ownerId !== input.uid) {
      return null;
    }
    const verificationSnapshot = await adminDb
      .collection("providerVerifications")
      .where("providerId", "==", input.providerId)
      .limit(2)
      .get();
    const verification = verificationSnapshot.docs.find(
      (document) => document.data().ownerId === input.uid,
    )?.data();
    if (verificationSnapshot.size > 0 && !verification) return null;
    return identityFromRecord(provider, verification, input.providerId);
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
  const snapshot = parseProviderAgreementSnapshot(
    source.providerAgreementSnapshot,
  );
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
