import {HttpsError} from "firebase-functions/v2/https";

export const PUBLISHED_AGREEMENT_VERSION_ERROR =
  "This agreement version has already been published. Create a new version to change the agreement text or effective date.";

export const ARCHIVED_AGREEMENT_VERSION_ERROR =
  "An archived agreement version cannot become current again. Create a new version to reuse its wording.";

export type AgreementVersionStatus = "draft" | "current" | "archived";

export type AgreementVersionSection = {
  title: string;
  paragraphs: string[];
};

export type AgreementVersionRecord = {
  version: string;
  name: string;
  effectiveDate: string;
  sections: AgreementVersionSection[];
  status: AgreementVersionStatus;
  createdAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

export function normalizeAgreementVersionLabel(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function agreementVersionsFromDocument(
  data: Record<string, unknown>,
): {explicit: boolean; versions: AgreementVersionRecord[]} {
  if (Array.isArray(data.versions)) {
    return {
      explicit: true,
      versions: data.versions.flatMap((entry) => {
        const parsed = parseVersionRecord(entry);
        return parsed ? [parsed] : [];
      }),
    };
  }

  return {
    explicit: false,
    versions: legacyAgreementVersions(data),
  };
}

export function currentAgreementVersion(
  versions: readonly AgreementVersionRecord[],
): AgreementVersionRecord | null {
  const current = versions.filter((entry) => entry.status === "current");
  return current.length === 1 ? current[0] : null;
}

export function sectionsEqual(
  left: readonly AgreementVersionSection[],
  right: readonly AgreementVersionSection[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((section, index) => {
    const other = right[index];
    return section.title === other.title &&
      section.paragraphs.length === other.paragraphs.length &&
      section.paragraphs.every(
        (paragraph, paragraphIndex) =>
          paragraph === other.paragraphs[paragraphIndex],
      );
  });
}

export function assertPublishedLegalContentUnchanged(
  versions: readonly AgreementVersionRecord[],
  next: {
    version: string;
    effectiveDate: string;
    sections: readonly AgreementVersionSection[];
  },
): void {
  const current = currentAgreementVersion(versions);
  if (!current) {
    throw new HttpsError(
      "failed-precondition",
      "This agreement does not have one current version.",
    );
  }
  const version = normalizeAgreementVersionLabel(next.version);
  if (
    version !== current.version ||
    next.effectiveDate !== current.effectiveDate ||
    !sectionsEqual(current.sections, next.sections)
  ) {
    throw new HttpsError(
      "failed-precondition",
      PUBLISHED_AGREEMENT_VERSION_ERROR,
    );
  }
  const archived = versions.find((entry) =>
    entry.status === "archived" && entry.version === version,
  );
  if (archived) {
    throw new HttpsError(
      "failed-precondition",
      PUBLISHED_AGREEMENT_VERSION_ERROR,
    );
  }
}

export function appendDraftVersion(input: {
  versions: readonly AgreementVersionRecord[];
  sourceVersion: string;
  version: string;
  effectiveDate: string;
  sections: readonly AgreementVersionSection[];
  now: string;
}): AgreementVersionRecord[] {
  const sourceVersion = normalizeAgreementVersionLabel(input.sourceVersion);
  const source = input.versions.find((entry) => entry.version === sourceVersion);
  if (!source || source.status === "draft") {
    throw new HttpsError(
      "failed-precondition",
      "Create a new version from a published agreement version.",
    );
  }
  const version = normalizeAgreementVersionLabel(input.version);
  assertVersionAvailable(input.versions, version);
  return [
    ...input.versions.map(cloneVersion),
    {
      version,
      name: source.name,
      effectiveDate: input.effectiveDate,
      sections: cloneSections(input.sections),
      status: "draft",
      createdAt: input.now,
      publishedAt: null,
      archivedAt: null,
    },
  ];
}

export function replaceDraftVersion(input: {
  versions: readonly AgreementVersionRecord[];
  draftVersion: string;
  version: string;
  effectiveDate: string;
  sections: readonly AgreementVersionSection[];
}): AgreementVersionRecord[] {
  const draftVersion = normalizeAgreementVersionLabel(input.draftVersion);
  const draft = input.versions.find((entry) => entry.version === draftVersion);
  if (!draft) {
    throw new HttpsError("not-found", "The agreement version was not found.");
  }
  if (draft.status !== "draft") {
    throw new HttpsError(
      "failed-precondition",
      PUBLISHED_AGREEMENT_VERSION_ERROR,
    );
  }
  const version = normalizeAgreementVersionLabel(input.version);
  assertVersionAvailable(input.versions, version, draftVersion);
  return input.versions.map((entry) => entry.version === draftVersion ? {
    ...cloneVersion(entry),
    version,
    effectiveDate: input.effectiveDate,
    sections: cloneSections(input.sections),
  } : cloneVersion(entry));
}

export function publishDraftVersion(input: {
  versions: readonly AgreementVersionRecord[];
  version: string;
  name: string;
  now: string;
}): AgreementVersionRecord[] {
  const version = normalizeAgreementVersionLabel(input.version);
  const selected = input.versions.find((entry) => entry.version === version);
  if (!selected) {
    throw new HttpsError("not-found", "The agreement version was not found.");
  }
  if (selected.status === "archived") {
    throw new HttpsError(
      "failed-precondition",
      ARCHIVED_AGREEMENT_VERSION_ERROR,
    );
  }
  if (selected.status === "current") {
    throw new HttpsError(
      "failed-precondition",
      "This agreement version is already current.",
    );
  }
  const next = input.versions.map((entry) => {
    if (entry.status === "current") {
      return {
        ...cloneVersion(entry),
        status: "archived" as const,
        archivedAt: input.now,
      };
    }
    if (entry.version === version) {
      return {
        ...cloneVersion(entry),
        name: input.name,
        status: "current" as const,
        publishedAt: input.now,
        archivedAt: null,
      };
    }
    return cloneVersion(entry);
  });
  if (next.filter((entry) => entry.status === "current").length !== 1) {
    throw new HttpsError(
      "failed-precondition",
      "Publishing must leave exactly one current agreement version.",
    );
  }
  return next;
}

export function deleteDraftVersion(
  versions: readonly AgreementVersionRecord[],
  version: string,
): AgreementVersionRecord[] {
  const draftVersion = normalizeAgreementVersionLabel(version);
  const selected = versions.find((entry) => entry.version === draftVersion);
  if (!selected) {
    throw new HttpsError("not-found", "The agreement version was not found.");
  }
  if (selected.status !== "draft") {
    throw new HttpsError(
      "failed-precondition",
      "Published agreement versions cannot be deleted.",
    );
  }
  return versions
    .filter((entry) => entry.version !== draftVersion)
    .map(cloneVersion);
}

export function mergePriorVersions(
  existing: unknown,
  versions: readonly AgreementVersionRecord[],
): Array<Record<string, unknown>> {
  const prior = Array.isArray(existing) ?
    existing.filter((entry) => isRecord(entry)).map((entry) => ({...entry})) :
    [];
  for (const version of versions) {
    if (version.status !== "archived") continue;
    const already = prior.some((entry) => entry.version === version.version);
    if (already) continue;
    prior.push({
      version: version.version,
      effectiveDate: version.effectiveDate,
      sections: cloneSections(version.sections),
      archivedAt: version.archivedAt,
    });
  }
  return prior;
}

export function versionAudit(
  versions: readonly AgreementVersionRecord[],
): Array<Record<string, unknown>> {
  return versions.map((entry) => ({
    version: entry.version,
    status: entry.status,
    effectiveDate: entry.effectiveDate,
    publishedAt: entry.publishedAt,
    archivedAt: entry.archivedAt,
  }));
}

function legacyAgreementVersions(
  data: Record<string, unknown>,
): AgreementVersionRecord[] {
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const archived = Array.isArray(data.priorVersions) ?
    data.priorVersions.flatMap((entry) => {
      const parsed = parseLegacyArchived(entry, name);
      return parsed ? [parsed] : [];
    }) :
    [];
  const current = parseLegacyCurrent(data, name);
  return current ? [...archived, current] : archived;
}

function parseLegacyCurrent(
  data: Record<string, unknown>,
  name: string,
): AgreementVersionRecord | null {
  if (typeof data.version !== "string" || typeof data.effectiveDate !== "string") {
    return null;
  }
  const sections = parseSections(data.sections);
  const version = normalizeAgreementVersionLabel(data.version);
  if (!name || !version || !DATE_ONLY.test(data.effectiveDate) || !sections) {
    return null;
  }
  return {
    version,
    name,
    effectiveDate: data.effectiveDate,
    sections,
    status: "current",
    createdAt: isoStamp(data.createdAt),
    publishedAt: isoStamp(data.updatedAt) ?? isoStamp(data.createdAt),
    archivedAt: null,
  };
}

function parseLegacyArchived(
  value: unknown,
  fallbackName: string,
): AgreementVersionRecord | null {
  if (!isRecord(value) || typeof value.version !== "string") return null;
  const sections = parseSections(value.sections);
  const effectiveDate = typeof value.effectiveDate === "string" ?
    value.effectiveDate :
    "";
  const version = normalizeAgreementVersionLabel(value.version);
  if (!version || !DATE_ONLY.test(effectiveDate) || !sections) return null;
  const name = typeof value.name === "string" && value.name.trim() ?
    value.name.trim() :
    fallbackName;
  if (!name) return null;
  return {
    version,
    name,
    effectiveDate,
    sections,
    status: "archived",
    createdAt: null,
    publishedAt: null,
    archivedAt: typeof value.archivedAt === "string" ? value.archivedAt : null,
  };
}

function parseVersionRecord(value: unknown): AgreementVersionRecord | null {
  if (!isRecord(value)) return null;
  if (
    value.status !== "draft" &&
    value.status !== "current" &&
    value.status !== "archived"
  ) {
    return null;
  }
  if (typeof value.version !== "string" || typeof value.name !== "string") {
    return null;
  }
  if (typeof value.effectiveDate !== "string" || !DATE_ONLY.test(value.effectiveDate)) {
    return null;
  }
  const sections = parseSections(value.sections);
  const version = normalizeAgreementVersionLabel(value.version);
  const name = value.name.trim();
  if (!version || !name || !sections) return null;
  return {
    version,
    name,
    effectiveDate: value.effectiveDate,
    sections,
    status: value.status,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : null,
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
    archivedAt: typeof value.archivedAt === "string" ? value.archivedAt : null,
  };
}

function parseSections(
  value: unknown,
): AgreementVersionSection[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) {
    return null;
  }
  const sections: AgreementVersionSection[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.title !== "string") return null;
    const title = entry.title.trim();
    if (title.length < 2 || title.length > 160 || !Array.isArray(entry.paragraphs)) {
      return null;
    }
    if (entry.paragraphs.length < 1 || entry.paragraphs.length > 12) return null;
    const paragraphs: string[] = [];
    for (const paragraph of entry.paragraphs) {
      if (typeof paragraph !== "string") return null;
      const text = paragraph.trim();
      if (text.length < 1 || text.length > 2000) return null;
      paragraphs.push(text);
    }
    sections.push({title, paragraphs});
  }
  return sections;
}

function assertVersionAvailable(
  versions: readonly AgreementVersionRecord[],
  version: string,
  ignoring?: string,
): void {
  const duplicate = versions.some((entry) =>
    entry.version === version && entry.version !== ignoring,
  );
  if (duplicate) {
    throw new HttpsError(
      "failed-precondition",
      `Version ${version} already exists for this agreement.`,
    );
  }
}

function cloneVersion(version: AgreementVersionRecord): AgreementVersionRecord {
  return {
    ...version,
    sections: cloneSections(version.sections),
  };
}

function cloneSections(
  sections: readonly AgreementVersionSection[],
): AgreementVersionSection[] {
  return sections.map((section) => ({
    title: section.title,
    paragraphs: [...section.paragraphs],
  }));
}

function isoStamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
