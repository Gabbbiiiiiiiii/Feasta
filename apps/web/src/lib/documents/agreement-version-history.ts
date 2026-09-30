import {withLegacyVersionSummary} from "../../../../../functions/src/shared/agreement-summary";
import {agreementSectionsToText, parseAgreementText} from "../../../../../functions/src/shared/agreement-text";
import {
  agreementVersionChoiceError,
  isRealCalendarDate,
  suggestNextAgreementVersion,
} from "../../../../../functions/src/shared/agreement-version-order";

import type {
  AgreementSection,
  AgreementVersionRecord,
  AgreementVersionStatus,
} from "@/lib/admin/file-maintenance/admin-document-catalog-types";

export {
  agreementVersionChoiceError,
  isRealCalendarDate,
  parseAgreementText,
  suggestNextAgreementVersion,
};

export function normalizeAgreementName(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function agreementDraftFieldErrors(input: {
  name: string;
  summary: string;
  version: string;
  effectiveDate: string;
  body: string;
  versions?: readonly {version: string; status?: string}[];
  ignoringVersion?: string;
  lockLegalContent?: boolean;
}): Partial<Record<"name" | "summary" | "version" | "effectiveDate" | "body", string>> {
  const errors: Partial<Record<"name" | "summary" | "version" | "effectiveDate" | "body", string>> = {};
  const name = normalizeAgreementName(input.name);
  if (!name) errors.name = "Agreement name is required.";
  else if (name.length < 2 || name.length > 120) {
    errors.name = "Enter an agreement name between 2 and 120 characters.";
  }
  if (input.summary.trim().length > 500) {
    errors.summary = "Summary must be 500 characters or fewer.";
  }
  if (input.lockLegalContent) return errors;
  const version = normalizeAgreementVersionLabel(input.version);
  if (!version || version.length > 40) errors.version = "Enter a valid version.";
  else if (input.versions) {
    const choice = agreementVersionChoiceError(version, input.versions, input.ignoringVersion);
    if (choice) errors.version = choice;
  }
  if (!isRealCalendarDate(input.effectiveDate.trim())) {
    errors.effectiveDate = "Enter a valid effective date.";
  }
  if (!input.body.trim()) errors.body = "Agreement text is required.";
  return errors;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

export function normalizeAgreementVersionLabel(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function sectionsToBody(sections: readonly AgreementSection[]): string {
  return agreementSectionsToText(sections);
}

export function bodyToSections(body: string): AgreementSection[] {
  return parseAgreementText(body).sections;
}

export function agreementVersionsFromRecord(
  data: Record<string, unknown>,
): {explicit: boolean; versions: AgreementVersionRecord[]} {
  if (Array.isArray(data.versions)) {
    return {
      explicit: true,
      versions: data.versions.flatMap((entry) => {
        const parsed = parseVersion(withLegacyVersionSummary(entry, data));
        return parsed ? [parsed] : [];
      }),
    };
  }
  return {explicit: false, versions: legacyVersions(data)};
}

export function currentPublishedVersion(agreement: {
  name: string;
  summary?: string;
  version: string;
  effectiveDate: string;
  sections: AgreementSection[];
  versions?: AgreementVersionRecord[];
}): AgreementVersionRecord | null {
  const versions = agreement.versions ?? [];
  const current = versions.filter((entry) => entry.status === "current");
  if (current.length === 1) return current[0];
  if (agreement.versions !== undefined) return null;
  return legacyCurrent(agreement);
}

export function displayAgreementVersions(agreement: {
  name: string;
  summary?: string;
  version: string;
  effectiveDate: string;
  sections: AgreementSection[];
  versions?: AgreementVersionRecord[];
}): AgreementVersionRecord[] {
  if (agreement.versions !== undefined) {
    return [...agreement.versions].sort(byNewest);
  }
  const current = legacyCurrent(agreement);
  return current ? [current] : [];
}

export function agreementPublication(agreement: {
  name: string;
  summary?: string;
  version: string;
  effectiveDate: string;
  sections: AgreementSection[];
  versions?: AgreementVersionRecord[];
}): {label: "Current" | "Draft" | "Archived" | "Not published"; version: string} {
  const versions = agreement.versions ?? [];
  const current = versions.filter((entry) => entry.status === "current");
  if (current.length === 1) {
    return {label: "Current", version: current[0].version};
  }
  if (versions.length === 0) {
    const legacy = currentPublishedVersion(agreement);
    return legacy
      ? {label: "Current", version: legacy.version}
      : {label: "Not published", version: ""};
  }
  const draft = versions.find((entry) => entry.status === "draft");
  if (current.length === 0 && draft) return {label: "Draft", version: draft.version};
  if (versions.every((entry) => entry.status === "archived")) {
    return {label: "Archived", version: versions[0]?.version ?? ""};
  }
  return {label: "Not published", version: ""};
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
    summary: typeof data.summary === "string" ? data.summary.trim() : "",
    version: typeof data.version === "string" ? data.version : "",
    effectiveDate: typeof data.effectiveDate === "string" ? data.effectiveDate : "",
    sections: parseSections(data.sections) ?? [],
  });
  return current ? [...archived, current] : archived;
}

function legacyCurrent(agreement: {
  name: string;
  summary?: string;
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
    ...(agreement.summary !== undefined ? {summary: agreement.summary} : {}),
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
    ...(typeof value.summary === "string" ? {summary: value.summary.trim()} : {}),
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
    ...(typeof value.summary === "string" ? {summary: value.summary.trim()} : {}),
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
