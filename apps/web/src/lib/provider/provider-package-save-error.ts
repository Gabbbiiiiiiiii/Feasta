/** Only known public callable messages are classified; arbitrary server text is never rendered. */
export function providerPackageSaveError(error: unknown): string {
  const record = error && typeof error === "object" ? error as {code?: unknown; message?: unknown} : {};
  const code = typeof record.code === "string" ? record.code.replace(/^functions\//u, "") : "";
  const message = typeof record.message === "string" ? record.message : "";
  if (code === "invalid-argument" && /^Unsupported package fields:\s*pricingModel\.?$/iu.test(message)) {
    return "The connected package service does not support this pricing model yet. Your entries are still here. Backend compatibility must be updated before you can save; changing or removing the pricing model is not a workaround.";
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return "The package service could not be reached or the save confirmation timed out. Your entries are still here. Check your connection and package list before retrying.";
  }
  if (code === "unauthenticated" || code === "session_expired") {
    return "Your session has expired. Keep this form open and sign in again before retrying.";
  }
  if (code === "resource-exhausted") return "Too many save attempts. Your entries are still here. Wait a moment before trying again.";
  if (code === "permission-denied") return "This account cannot save this package. Your entries are still here. Check your provider access before retrying.";
  if (code === "invalid-argument") return "The package service rejected one or more fields. Your entries are still here. Review your details; if they are valid, the connected backend may need a compatibility update.";
  if (code === "failed-precondition") return "The package or provider is not currently eligible for this save. Your entries are still here. Check your provider setup and package status before retrying.";
  return "The package could not be saved. Your entries are still here. Try again; if it continues, check package service compatibility.";
}
