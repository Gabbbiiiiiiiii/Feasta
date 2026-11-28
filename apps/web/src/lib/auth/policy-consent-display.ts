export function policyConsentDisplay(accepted: boolean, version: string): string {
  if (!accepted) return "Not recorded";
  if (!version.trim() || version === "unversioned") {
    return "Accepted (version not recorded)";
  }
  return `Accepted (version ${version})`;
}
