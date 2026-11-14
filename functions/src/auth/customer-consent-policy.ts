import type {Transaction} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {AGREEMENT_TYPES} from "../shared/agreement-types.js";
import {db} from "../shared/firestore.js";
import {resolvePublishedLegalAgreement} from "../shared/published-legal-agreement.js";

type VerifiedConsent = {termsVersion: string; privacyVersion: string};

/** All agreement reads precede profile writes and participate in their transaction. */
export async function validateCustomerConsent(
  transaction: Transaction,
  input: Record<string, unknown>,
  newCustomer: boolean,
): Promise<VerifiedConsent | null> {
  const explicit = input.acceptedTerms === true || input.acceptedPrivacy === true;
  if (!newCustomer && !explicit) return null;
  if (input.acceptedTerms !== true || input.acceptedPrivacy !== true) {
    throw new HttpsError(
      "failed-precondition",
      "Accept the current Terms and Privacy Policy before continuing.",
      {reason: "consent-required"},
    );
  }
  const termsVersion = requiredVersion(input.termsPolicyVersion);
  const privacyVersion = requiredVersion(input.privacyPolicyVersion);
  const [types, agreements] = await Promise.all([
    transaction.get(db.collection(AGREEMENT_TYPES)),
    transaction.get(db.collection("agreementTemplates")),
  ]);
  const terms = resolvePublishedLegalAgreement("platform_terms", types, agreements);
  const privacy = resolvePublishedLegalAgreement("privacy_notice", types, agreements);
  if (!terms || !privacy) {
    throw new HttpsError(
      "failed-precondition",
      "Current agreements are unavailable. Please try again later.",
      {reason: "policy-unavailable"},
    );
  }
  if (termsVersion !== terms.version || privacyVersion !== privacy.version) {
    throw new HttpsError(
      "failed-precondition",
      "Agreements have changed. Review and accept the current agreements.",
      {reason: "policy-version-outdated"},
    );
  }
  return {termsVersion: terms.version, privacyVersion: privacy.version};
}

function requiredVersion(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    throw new HttpsError(
      "invalid-argument", "Both accepted agreement versions are required.",
      {reason: "invalid-policy-version"},
    );
  }
  if (typeof value !== "string" || !value.trim() ||
      value !== value.trim() || value.length > 100) {
    throw new HttpsError(
      "invalid-argument", "Accepted agreement versions must be valid identifiers.",
      {reason: "invalid-policy-version"},
    );
  }
  return value;
}
