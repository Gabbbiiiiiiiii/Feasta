/**
 * Step 4.1B: private editor media manifest.
 *
 * This module validates structure only.
 * It NEVER proves asset ownership, Cloudinary existence,
 * draft attachment, or permission to publish.
 *
 * Callers must verify each ID against a server-owned asset ledger
 * before attaching media to private progress.
 */

export class EditorDraftMediaManifestError extends Error {
  constructor() {
    super("INVALID_EDITOR_DRAFT_MEDIA");
    this.name = "EditorDraftMediaManifestError";
  }
}

export type EditorDraftThemeMediaV1 = {
  themeId: string;
  assetIds: string[];
};

export type EditorDraftMediaManifestV1 = {
  packageAssetIds: string[];
  themes: EditorDraftThemeMediaV1[];
};

const IDENTIFIER = /^[A-Za-z0-9_-]{1,128}$/u;

function invalid(): never {
  throw new EditorDraftMediaManifestError();
}

function record(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    return invalid();
  }

  const input = value as Record<string, unknown>;

  if (
    Reflect.ownKeys(input).length !== fields.length ||
    Reflect.ownKeys(input).some(
      (key) => typeof key !== "string" || !fields.includes(key)
    ) ||
    Object.values(Object.getOwnPropertyDescriptors(input)).some(
      (descriptor) => !("value" in descriptor) || !descriptor.enumerable
    )
  ) {
    return invalid();
  }

  return input;
}

function identifier(value: unknown): string {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    return invalid();
  }

  return value;
}

function identifiers(
  value: unknown,
  maximum: number,
  allAssets: Set<string>,
): string[] {
  if (
    !Array.isArray(value) ||
    value.length > maximum ||
    Object.keys(value).length !== value.length
  ) {
    return invalid();
  }

  return value.map((entry) => {
    const id = identifier(entry);

    if (allAssets.has(id)) {
      return invalid();
    }

    allAssets.add(id);
    return id;
  });
}

export function parseEditorDraftMediaManifestV1(
  value: unknown,
): EditorDraftMediaManifestV1 {
  const input = record(value, ["packageAssetIds", "themes"]);
  const allAssets = new Set<string>();

  const packageAssetIds = identifiers(
    input.packageAssetIds, 8, allAssets
  );

  if (
    !Array.isArray(input.themes) ||
    input.themes.length > 12 ||
    Object.keys(input.themes).length !== input.themes.length
  ) {
    return invalid();
  }

  const themeIds = new Set<string>();

  const themes = input.themes.map((item) => {
    const theme = record(item, ["themeId", "assetIds"]);
    const themeId = identifier(theme.themeId);

    if (themeIds.has(themeId)) {
      return invalid();
    }

    themeIds.add(themeId);

    return {
      themeId,
      assetIds: identifiers(theme.assetIds, 4, allAssets),
    };
  });

  return {packageAssetIds, themes};
}