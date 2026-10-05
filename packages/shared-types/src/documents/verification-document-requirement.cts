export interface ProviderVerificationDocumentPolicy {
  requiredAll: readonly string[];
  requiredOneOf: readonly (readonly string[])[];
}

export function verificationDocumentRequirement(
  type: string,
  policy: ProviderVerificationDocumentPolicy,
): "required" | "one_of" | "optional" {
  if (policy.requiredAll.includes(type)) return "required";
  if (policy.requiredOneOf.some((group) => group.includes(type))) {
    return "one_of";
  }
  return "optional";
}

export function verificationDocumentsSatisfyPolicy(
  documentTypes: ReadonlySet<string>,
  policy: ProviderVerificationDocumentPolicy,
): boolean {
  return policy.requiredAll.every((type) => documentTypes.has(type)) &&
    policy.requiredOneOf.every((group) =>
      group.some((type) => documentTypes.has(type))
    );
}
