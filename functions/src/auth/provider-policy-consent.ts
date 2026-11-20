import {HttpsError} from "firebase-functions/v2/https";

/** Preserve historical evidence; only record missing acceptance. */
export function providerPolicyConsentPatch(
  existing: Record<string, unknown> | null | undefined,
  input: {acceptedTerms: boolean; acceptedPrivacy: boolean;
    termsPolicyVersion: string; privacyPolicyVersion: string},
  current: {terms: string | null; privacy: string | null},
  timestamp: () => unknown,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const policy of ["terms", "privacy"] as const) {
    if (existing?.[policy + "AcceptedAt"] != null) continue;
    const accepted = policy === "terms" ? input.acceptedTerms : input.acceptedPrivacy;
    const version = input[policy === "terms" ? "termsPolicyVersion" : "privacyPolicyVersion"];
    const historicalVersion = existing?.[policy + "PolicyVersion"];
    if (historicalVersion != null && historicalVersion !== version) {
      throw new HttpsError("failed-precondition",
        "Existing policy version evidence requires review before recording acceptance.");
    }
    if (!accepted || !current[policy] || version !== current[policy] ||
      version === "unversioned") {
      throw new HttpsError("failed-precondition",
        "The published Terms or Privacy Policy is unavailable or changed. " +
        "Review the policies again.");
    }
    patch[policy + "PolicyVersion"] = current[policy];
    patch[policy + "AcceptedAt"] = timestamp();
  }
  return patch;
}
