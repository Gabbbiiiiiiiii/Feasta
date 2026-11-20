/** Only known public callable messages are classified; arbitrary server text is never rendered. */
export function providerPackageSaveError(error: unknown): string {
  const record = error && typeof error === "object" ? error as {code?: unknown; message?: unknown; details?: {reason?: unknown; field?: unknown; step?: unknown}} : {};
  const code = typeof record.code === "string" ? record.code.replace(/^functions\//u, "") : "";
  const reason = record.details?.reason;
  if (reason === "FEATURE_DISABLED" || record.message === "FEATURE_DISABLED") return "Private V2 draft saving is not enabled in this environment.";
  if (record.message === "INVALID_DRAFT_RESPONSE") return "The backend response did not confirm the expected package and revision. Your entries are still here. Check your package list and retry the pending request before creating another draft.";
  if (record.message === "PENDING_V2_SAVE") return "An earlier save is unconfirmed. Retry the pending request before making another package.";
  if (reason === "EDITOR_DRAFT_COMPLETED") return "This progress already became a package draft. Refresh your package list to open it.";
  const message = typeof record.message === "string" ? record.message : "";
  if (code === "aborted" || record.details?.reason === "REVISION_CONFLICT") return "The package or occasion eligibility changed. Your entries are still here. Reload current package and occasion choices before retrying.";
  if (reason === "CLIENT_UPGRADE_REQUIRED" && record.details?.field === "media" && record.details?.step === 4) return "Step 4: This saved progress contains image references that cannot yet be completed through the verified draft-media lifecycle. Your entries are still here. Keep the progress draft until media recovery and promotion are supported.";
  const reasons: Record<string, string> = {
    PROVIDER_OCCASION_APPROVAL_REQUIRED: "The connected backend still requires an obsolete private-draft approval. A compatible backend update is required before retrying.",
    INDIVIDUAL_FOOD_PACKAGE_UNSUPPORTED: "Step 3: Individual food serving sizes can be kept as private editor progress, but this backend does not support creating an individual-food package. Keep your progress until that contract is supported.",
    PROVIDER_NOT_APPROVED: "Provider verification is required before saving a package draft.",
    ACCOUNT_ACCESS_DENIED: "Your provider account must be active before saving a package draft.",
    INVALID_SERVICE_CATEGORY: "This service category is not approved and active for your provider account.",
    OCCASION_INACTIVE: "This occasion is inactive or unavailable. Choose another occasion.",
    PROVIDER_OCCASION_INELIGIBLE: "This occasion is unavailable for the selected service category.",
    CONFIG_UNAVAILABLE: "The current occasion catalog or package configuration is unavailable. Reload current choices before retrying.",
    INVALID_OFFER_STRUCTURE: "Step 1: Choose a valid package structure.",
    INVALID_PACKAGE_STYLE: "Step 1: Package style must contain 2 to 80 safe characters.",
    INVALID_NAME: "Step 1: Check the package name and description lengths.",
    INVALID_OCCASION_SELECTION: "Step 1: Choose an active, approved occasion available for this service category.",
    INVALID_FOOD_CHOICE_GROUP: "Step 3: Check food selection names, options and required selection counts.",
    INVALID_FOOD_CHOICE_GROUPS: "Step 3: Check food selection names, options and required selection counts.",
    INVALID_MEDIA_REFERENCE: "Step 4: An image reference is not valid for this package. Remove it and select an authorized image.",
    INVALID_EDITOR_PROGRESS: "Saved editor progress contains invalid fields. Review the draft before retrying; no package save is confirmed.",
    INCOMPLETE_EDITOR_PROGRESS: "Saved progress is incomplete. Review all five steps before creating a package draft.",
    CLIENT_UPGRADE_REQUIRED: "The package editor and backend contract versions differ. Reload after the compatible backend is available.",
  };
  if (typeof reason === "string" && Object.hasOwn(reasons, reason)) return reasons[reason] + " Your entries are still here.";
  if (code === "invalid-argument" && /^Unsupported package fields:\s*(?:pricingModel|offerStructure|packageStyle)(?:,\s*(?:pricingModel|offerStructure|packageStyle))*\.?$/iu.test(message) && !/^Unsupported package fields:\s*pricingModel\.?$/iu.test(message)) {
    return "The connected backend does not yet accept the package pricing or classification fields sent by this editor. Your entries are still here. A compatible backend release is required; these fields cannot be silently removed.";
  }
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
