/** Server-only signing plan. Scope MUST come from an authorized draft/reservation. */
export type EditorDraftUploadScopeV1 = {
  ownerUid: string;
  providerId: string;
  editorDraftId: string;
  assetId: string;
  kind: "package" | "theme";
  themeId: string | null;
};

export function editorDraftUploadPlanV1(
  scope: EditorDraftUploadScopeV1,
  timestamp: number,
) {
  const id = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(value);
  if (!scope || !id(scope.ownerUid) || !id(scope.providerId) ||
      !id(scope.editorDraftId) || !id(scope.assetId) ||
      !Number.isSafeInteger(timestamp) || timestamp < 1 ||
      (scope.kind !== "package" && scope.kind !== "theme") ||
      (scope.kind === "package" && scope.themeId !== null) ||
      (scope.kind === "theme" && !id(scope.themeId))) {
    throw new Error("INVALID_EDITOR_DRAFT_UPLOAD_SCOPE");
  }
  const prefix = `feasta/providers/${scope.ownerUid}` +
    `/editor-drafts/${scope.editorDraftId}`;
  const publicId = scope.kind === "package" ?
    `${prefix}/package/${scope.assetId}` :
    `${prefix}/themes/${scope.themeId}/${scope.assetId}`;
  // Sign the complete restrictions. Never reuse service-image overwrite=true.
  // Cloudinary signatures do not sign resource_type: the server lookup must
  // independently require image, allowed format, bytes and exact public ID.
  return {
    public_id: publicId,
    timestamp,
    overwrite: false as const,
    allowed_formats: "jpg,jpeg,png,webp",
  };
}
