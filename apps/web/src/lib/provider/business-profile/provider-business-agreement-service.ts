import "server-only";

import type {BusinessAgreementView} from "@/components/provider/provider-business-agreement-card";
import {getPublishedProviderAgreement} from "@/lib/documents/document-catalog-service";
import {loadProviderAgreementAcceptanceSummary} from "@/lib/provider/provider-agreement-download";
import {providerAgreementClientData} from "@/lib/provider/provider-agreement-record";

export async function loadBusinessAgreementView(input: {
  uid: string;
  providerId: string | null;
}): Promise<BusinessAgreementView> {
  try {
    const acceptance = await loadProviderAgreementAcceptanceSummary(input);
    if (!acceptance) throw new Error("Agreement ownership record unavailable");
    const accepted = acceptance.accepted;
    // Never substitute today's published text for a missing accepted snapshot.
    const snapshot = acceptance.snapshot;
    const document = accepted
      ? snapshot && (!acceptance.acceptedVersion || snapshot.version === acceptance.acceptedVersion)
        ? snapshot : null
      : await getPublishedProviderAgreement();
    return {
      accepted,
      acceptedVersion: acceptance.acceptedVersion,
      acceptedAtLabel: acceptance.acceptedAtLabel,
      document: providerAgreementClientData(document),
      unavailable: false,
      history: acceptance.history?.map((entry) => ({
        acceptedVersion: entry.acceptedVersion, acceptedAtLabel: entry.acceptedAtLabel,
        document: providerAgreementClientData(entry.snapshot),
      })),
    };
  } catch {
    return {accepted: false, acceptedVersion: "", acceptedAtLabel: null, document: null, unavailable: true};
  }
}
