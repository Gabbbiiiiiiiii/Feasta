import type {
  AgreementSection,
  AgreementVersionRecord,
  AgreementVersionStatus,
} from "@/lib/admin/file-maintenance/admin-document-catalog-types";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

export function normalizeAgreementVersionLabel(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function sectionsToBody(sections: readonly AgreementSection[]): string {
  return sections
    .map((section) => `# ${section.title}\n\n${section.paragraphs.join("\n\n")}`)
    .join("\n\n");
}

export function bodyToSections(body: string): AgreementSection[] {
  const trimmed = body.trim();
  if (!trimmed.startsWith("# ")) {
    throw new Error("Start each section with a heading line that begins with #.");
  }
  return trimmed.split(/\n(?=# )/u).map((block) => {
    const [heading = "", ...rest] = block.split("\n");
    const title = heading.replace(/^#\s+/u, "").trim();
    const paragraphs = rest
      .join("\n")
      .split(/\n\s*\n/u)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    if (title.length < 2 || title.length > 160) {
      throw new Error("Each section heading must be between 2 and 160 characters.");
    }
    if (paragraphs.length < 1 || paragraphs.some((paragraph) => paragraph.length > 2000)) {
      throw new Error(`Add paragraphs under "${title}" that are 2000 characters or fewer.`);
    }
    return {title, paragraphs};
  });
}

export function agreementVersionsFromRecord(
  data: Record<string, unknown>,
): {explicit: boolean; versions: AgreementVersionRecord[]} {
  if (Array.isArray(data.versions)) {
    return {
      explicit: true,
      versions: data.versions.flatMap((entry) => {
        const parsed = parseVersion(entry);
        return parsed ? [parsed] : [];
      }),
    };
  }
  return {explicit: false, versions: legacyVersions(data)};
}

export function currentPublishedVersion(agreement: {
  name: string;
  version: string;
  effectiveDate: string;
  sections: AgreementSection[];
  versions?: AgreementVersionRecord[];
}): AgreementVersionRecord | null {
  const versions = agreement.versions ?? [];
  const current = versions.filter((entry) => entry.status === "current");
  if (current.length === 1) return current[0];
  if (versions.length > 0) return null;
  return legacyCurrent(agreement);
}

export function displayAgreementVersions(agreement: {
  name: string;
  version: string;
  effectiveDate: string;
  sections: AgreementSection[];
  versions?: AgreementVersionRecord[];
}): AgreementVersionRecord[] {
  if (agreement.versions && agreement.versions.length > 0) {
    return [...agreement.versions].sort(byNewest);
  }
  const current = legacyCurrent(agreement);
  return current ? [current] : [];
}

export function versionStatusLabel(status: AgreementVersionStatus): string {
  if (status === "current") return "Current";
  if (status === "archived") return "Archived";
  return "Draft";
}

export function versionActivityDate(version: AgreementVersionRecord): string {
  const stamp = version.publishedAt ?? version.createdAt ?? version.archivedAt;
  if (!stamp) return "";
  return stamp.slice(0, 10);
}

function legacyVersions(data: Record<string, unknown>): AgreementVersionRecord[] {
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const archived = Array.isArray(data.priorVersions) ?
    data.priorVersions.flatMap((entry) => {
      const parsed = parseLegacyArchived(entry, name);
      return parsed ? [parsed] : [];
    }) :
    [];
  const current = legacyCurrent({
    name,
    version: typeof data.version === "string" ? data.version : "",
    effectiveDate: typeof data.effectiveDate === "string" ? data.effectiveDate : "",
    sections: parseSections(data.sections) ?? [],
  });
  return current ? [...archived, current] : archived;
}

function legacyCurrent(agreement: {
  name: string;
  version: string;
  effectiveDate: string;
  sections: AgreementSection[];
}): AgreementVersionRecord | null {
  const version = normalizeAgreementVersionLabel(agreement.version);
  if (
    !agreement.name.trim() ||
    !version ||
    !DATE_ONLY.test(agreement.effectiveDate) ||
    agreement.sections.length === 0
  ) {
    return null;
  }
  return {
    version,
    name: agreement.name.trim(),
    effectiveDate: agreement.effectiveDate,
    sections: agreement.sections.map((section) => ({
      title: section.title,
      paragraphs: [...section.paragraphs],
    })),
    status: "current",
    createdAt: null,
    publishedAt: null,
    archivedAt: null,
  };
}

function parseLegacyArchived(
  value: unknown,
  fallbackName: string,
): AgreementVersionRecord | null {
  if (!isRecord(value) || typeof value.version !== "string") return null;
  const sections = parseSections(value.sections);
  const effectiveDate = typeof value.effectiveDate === "string" ? value.effectiveDate : "";
  const version = normalizeAgreementVersionLabel(value.version);
  const name = typeof value.name === "string" && value.name.trim() ?
    value.name.trim() :
    fallbackName;
  if (!name || !version || !DATE_ONLY.test(effectiveDate) || !sections) return null;
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

function parseVersion(value: unknown): AgreementVersionRecord | null {
  if (!isRecord(value)) return null;
  if (value.status !== "draft" && value.status !== "current" && value.status !== "archived") {
    return null;
  }
  if (typeof value.version !== "string" || typeof value.name !== "string") return null;
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

function parseSections(value: unknown): AgreementSection[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) return null;
  const sections: AgreementSection[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.title !== "string" || !Array.isArray(entry.paragraphs)) {
      return null;
    }
    const title = entry.title.trim();
    const paragraphs = entry.paragraphs.filter((paragraph): paragraph is string =>
      typeof paragraph === "string" && paragraph.trim().length > 0,
    );
    if (
      title.length < 2 ||
      title.length > 160 ||
      paragraphs.length !== entry.paragraphs.length ||
      paragraphs.length < 1 ||
      paragraphs.length > 12 ||
      paragraphs.some((paragraph) => paragraph.trim().length > 2000)
    ) {
      return null;
    }
    sections.push({title, paragraphs: paragraphs.map((paragraph) => paragraph.trim())});
  }
  return sections;
}

function byNewest(left: AgreementVersionRecord, right: AgreementVersionRecord): number {
  const rank = {draft: 0, current: 1, archived: 2};
  if (rank[left.status] !== rank[right.status]) return rank[left.status] - rank[right.status];
  const leftStamp = left.publishedAt ?? left.createdAt ?? "";
  const rightStamp = right.publishedAt ?? right.createdAt ?? "";
  return rightStamp.localeCompare(leftStamp);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
