import "server-only";

import {getProviderOnboardingAgreement} from "@/lib/documents/document-catalog-service";
import {adminDb} from "@/lib/firebase/admin";
import {renderProviderAgreementPdf} from "@/lib/provider/provider-agreement-pdf";
import {
  authorizedRepresentativeName,
  parseProviderAgreementSnapshot,
  selectProviderAgreementPdf,
  type ProviderAgreementSnapshot,
} from "@/lib/provider/provider-agreement-record";

export type ProviderAgreementAcceptanceSummary = {
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
  };
}

export async function loadProviderAgreementPdfDocument(input: {
  uid: string;
  providerId: string | null;
  copy: "current" | "accepted";
}): Promise<{bytes: Uint8Array; version: string} | null> {
  const [current, identity] = await Promise.all([
    getProviderOnboardingAgreement(),
    loadProviderAgreementIdentity(input),
  ]);
  if (!identity) return null;
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
