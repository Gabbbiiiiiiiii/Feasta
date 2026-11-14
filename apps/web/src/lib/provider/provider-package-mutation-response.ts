/** Confirm server acknowledgement before any UI reports a saved package. */
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("INVALID_DRAFT_RESPONSE");
  return value as Record<string, unknown>;
}
function identifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value);
}
export function validatePackageMutationResponse(value: unknown, status: "draft" | "published" | "archived", packageId?: unknown): void {
  const result = record(value);
  if (result.success !== true || result.status !== status || !identifier(result.packageId) ||
      (packageId !== undefined && result.packageId !== packageId)) throw new Error("INVALID_DRAFT_RESPONSE");
}
export function validateV2DraftResponse(value: unknown, expected: {
  kind: "create" | "update" | "complete";
  packageId?: string; revision?: number; editorDraftId?: string;
}): void {
  const result = record(value);
  const expectedPackageRevision = expected.kind === "update" ? (expected.revision ?? 0) + 1 : 1;
  if (result.status !== "draft" || !identifier(result.packageId) || result.packageRevision !== expectedPackageRevision ||
      (expected.packageId !== undefined && result.packageId !== expected.packageId)) throw new Error("INVALID_DRAFT_RESPONSE");
  if (expected.kind === "complete") {
    if (result.editorDraftId !== expected.editorDraftId || result.editorDraftRevision !== (expected.revision ?? 0) + 1) throw new Error("INVALID_DRAFT_RESPONSE");
  } else if (result.success !== true || result.sharedContractVersion !== 2) throw new Error("INVALID_DRAFT_RESPONSE");
}
