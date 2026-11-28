import {httpsCallable} from "firebase/functions";
import {functions} from "@/lib/firebase/client";

export type CustomerConsent = {acceptedTerms: true; acceptedPrivacy: true; termsPolicyVersion: string; privacyPolicyVersion: string};
export type PublishedCustomerAgreement = {code: string; name: string; summary: string; version: string; effectiveDate: string; sections: {title: string; paragraphs: string[]}[]};
export const consentMessages = {
  "consent-required": "Review and accept both agreements before continuing.",
  "policy-version-outdated": "The agreements have changed. Review both updated agreements and accept them again.",
  "policy-unavailable": "Current agreements are unavailable. Reload agreements to try again.",
  "invalid-policy-version": "The agreement versions could not be confirmed. Review and accept both agreements again.",
} as const;
export function consentReason(error: unknown): keyof typeof consentMessages | undefined {
  if (!error || typeof error !== "object") return;
  const value = error as {details?: {reason?: unknown}; reason?: unknown};
  const reason = value.details?.reason ?? value.reason;
  return typeof reason === "string" && Object.hasOwn(consentMessages, reason) ? reason as keyof typeof consentMessages : undefined;
}
function record(value: unknown): value is Record<string, unknown> {return !!value && typeof value === "object" && !Array.isArray(value);}
export function parseCustomerAgreement(value: unknown): PublishedCustomerAgreement {
  const text = (v: unknown, max: number) => typeof v === "string" && !!v.trim() && v.length <= max;
  if (!record(value) || !text(value.code, 200) || !text(value.name, 200) ||
      !text(value.version, 100) || value.version !== (value.version as string).trim() ||
      typeof value.summary !== "string" || typeof value.effectiveDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value.effectiveDate) ||
      Number.isNaN(Date.parse(value.effectiveDate)) || new Date(value.effectiveDate).toISOString().slice(0,10) !== value.effectiveDate ||
      !Array.isArray(value.sections) || value.sections.length < 1 || value.sections.length > 40 ||
      !value.sections.every(section => record(section) && text(section.title,160) &&
        Array.isArray(section.paragraphs) && section.paragraphs.length >= 1 && section.paragraphs.length <= 12 &&
        section.paragraphs.every(p => text(p,2000)))) {
    throw new Error(consentMessages["policy-unavailable"]);
  }
  return value as PublishedCustomerAgreement;
}
// functions is explicitly initialized in asia-southeast1 by firebase/client.
export async function loadCustomerAgreements() {
  const callable = httpsCallable<{purpose: string}, {agreement: unknown}>(functions, "getCurrentLegalAgreement");
  const [terms, privacy] = await Promise.all([
    callable({purpose: "platform_terms"}), callable({purpose: "privacy_notice"}),
  ]);
  return {terms: parseCustomerAgreement(terms.data.agreement), privacy: parseCustomerAgreement(privacy.data.agreement)};
}
