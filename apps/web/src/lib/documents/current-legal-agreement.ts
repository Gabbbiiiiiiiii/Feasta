import "server-only";

import {adminDb} from "@/lib/firebase/admin";

// Web-local resolver. The Next.js bundler cannot import functions/src because
// Functions keeps Node ESM ".js" specifiers. This module repeats only the
// trusted public selection rules and does not read Functions source.

const AGREEMENT_TYPES = "agreementTypes";
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

const TRUSTED_LEGAL_TYPES = {
  terms_of_service: {
    purpose: "platform_terms",
    singleton: true,
    requiresAcceptance: false,
    targetAudience: "platform",
  },
  privacy_policy: {
    purpose: "privacy_notice",
    singleton: true,
    requiresAcceptance: false,
    targetAudience: "platform",
  },
} as const;

export type LegalPurpose = "platform_terms" | "privacy_notice";

type LegalSection = {title: string; paragraphs: string[]};

type PublishedAgreement = {
  code: string;
  name: string;
  summary: string;
  version: string;
  effectiveDate: string;
  sections: LegalSection[];
};

type ParsedVersion = {
  name: string;
  summary?: string;
  version: string;
  effectiveDate: string;
  sections: LegalSection[];
  status: string;
};

export async function getCurrentLegalAgreement(
  purpose: LegalPurpose,
): Promise<PublishedAgreement | null> {
  try {
    const [types, agreements] = await Promise.all([
      adminDb.collection(AGREEMENT_TYPES).get(),
      adminDb.collection("agreementTemplates").get(),
    ]);
    return resolvePublishedLegalAgreement(
      purpose,
      types.docs.map((document) => ({id: document.id, data: document.data()})),
      agreements.docs.map((document) => ({id: document.id, data: document.data()})),
    );
  } catch (error: unknown) {
    console.error("Could not load the published legal agreement", {purpose, error});
    return null;
  }
}

export function resolvePublishedLegalAgreement(
  purpose: LegalPurpose,
  types: readonly {id: string; data: Record<string, unknown>}[],
  agreements: readonly {id: string; data: Record<string, unknown>}[],
): PublishedAgreement | null {
  const matchingTypes = types.filter((type) => isTrustedLegalType(type.id, type.data, purpose));
  if (matchingTypes.length !== 1) return null;
  const matches = agreements.filter((agreement) =>
    agreement.data.agreementTypeCode === matchingTypes[0].id,
  );
  if (matches.length !== 1) return null;
  const versions = selectableVersions(matches[0].data);
  const current = versions.filter((version) => version.status === "current");
  if (current.length !== 1) return null;
  const version = current[0];
  return {
    code: matches[0].id,
    name: version.name,
    summary: version.summary ?? "",
    version: version.version,
    effectiveDate: version.effectiveDate,
    sections: version.sections.map((section) => ({
      title: section.title,
      paragraphs: [...section.paragraphs],
    })),
  };
}

function isTrustedLegalType(
  id: string,
  data: Record<string, unknown>,
  purpose: LegalPurpose,
): boolean {
  const contract = TRUSTED_LEGAL_TYPES[id as keyof typeof TRUSTED_LEGAL_TYPES];
  if (!contract || contract.purpose !== purpose || data.system !== true) return false;
  return data.purpose === contract.purpose &&
    data.singleton === contract.singleton &&
    data.requiresAcceptance === contract.requiresAcceptance &&
    data.targetAudience === contract.targetAudience;
}

function selectableVersions(data: Record<string, unknown>): ParsedVersion[] {
  if (!Array.isArray(data.versions)) return [];
  const rawCurrent = data.versions.filter((version) =>
    isRecord(version) && version.status === "current",
  );
  if (rawCurrent.length !== 1) return [];
  return data.versions.flatMap((entry) => {
    const parsed = parseVersion(withLegacyVersionSummary(entry, data));
    return parsed ? [parsed] : [];
  });
}

function withLegacyVersionSummary(
  value: unknown,
  document: Record<string, unknown>,
): unknown {
  if (!isRecord(value) || "summary" in value || typeof document.summary !== "string") {
    return value;
  }
  const versions = Array.isArray(document.versions) ? document.versions : [];
  const ownsSummary = value.status === "current" ||
    (value.status === "draft" && value.version === document.version &&
      !versions.some((version) => isRecord(version) && version.status === "current"));
  return ownsSummary ? {...value, summary: document.summary} : value;
}

function parseVersion(value: unknown): ParsedVersion | null {
  if (!isRecord(value)) return null;
  if (value.status !== "draft" && value.status !== "current" && value.status !== "archived") {
    return null;
  }
  if (typeof value.version !== "string" || typeof value.name !== "string") return null;
  if (typeof value.effectiveDate !== "string" || !DATE_ONLY.test(value.effectiveDate)) {
    return null;
  }
  const sections = parseSections(value.sections);
  const version = value.version.trim().replace(/\s+/gu, " ");
  const name = value.name.trim();
  if (!version || !name || !sections) return null;
  return {
    version,
    name,
    ...(typeof value.summary === "string" ? {summary: value.summary.trim()} : {}),
    effectiveDate: value.effectiveDate,
    sections,
    status: value.status,
  };
}

function parseSections(value: unknown): LegalSection[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) return null;
  const sections: LegalSection[] = [];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
