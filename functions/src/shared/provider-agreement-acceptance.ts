import {
  agreementVersionsFromDocument,
  currentAgreementVersion,
} from "./agreement-versions.js";
import {isDocumentCode} from "./document-catalog-policy.js";

export type ProviderAgreementSection = {
  title: string;
  paragraphs: string[];
};

export type ProviderAgreementSource = {
  code: string;
  name: string;
  version: string;
  effectiveDate: string;
  sections: ProviderAgreementSection[];
};

export type ProviderAgreementSnapshot = {
  code: string;
  name: string;
  version: string;
  effectiveDate: string;
  sections: ProviderAgreementSection[];
  acceptedAt?: unknown;
};

export type StoredProviderAgreementAcceptance = {
  providerAgreementAccepted: true;
  providerAgreementCode: string;
  providerAgreementName: string;
  providerAgreementVersion: string;
  providerAgreementEffectiveDate: string;
  providerAgreementTemplateCode: string;
  providerAgreementSnapshot: ProviderAgreementSnapshot;
};

export type AgreementAcceptanceDecision =
  | {action: "reject"}
  | {action: "preserve"}
  | {action: "record"; acceptance: StoredProviderAgreementAcceptance};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;

export function parseActiveOnboardingAgreement(
  id: string,
  data: Record<string, unknown>,
): ProviderAgreementSource | null {
  if (!isDocumentCode(id)) return null;
  if (data.status !== "active" || data.useForProviderOnboarding !== true) {
    return null;
  }
  const stored = agreementVersionsFromDocument(data);
  if (stored.explicit) {
    const current = currentAgreementVersion(stored.versions);
    if (!current) return null;
    const name = boundedText(data.name, 2, 120) ?? current.name;
    return {
      code: id,
      name,
      version: current.version,
      effectiveDate: current.effectiveDate,
      sections: current.sections.map((section) => ({
        title: section.title,
        paragraphs: [...section.paragraphs],
      })),
    };
  }

  const name = boundedText(data.name, 2, 120);
  const version = boundedText(data.version, 1, 40);
  const effectiveDate = boundedText(data.effectiveDate, 10, 10);
  const sections = parseAgreementSections(data.sections);
  if (!name || !version || !effectiveDate || !DATE_ONLY.test(effectiveDate)) {
    return null;
  }
  if (!sections) return null;
  return {code: id, name, version, effectiveDate, sections};
}

export function parseProviderAgreementSnapshot(
  value: unknown,
): ProviderAgreementSnapshot | null {
  if (!isRecord(value)) return null;
  const code = boundedText(value.code, 2, 100);
  const name = boundedText(value.name, 2, 120);
  const version = boundedText(value.version, 1, 40);
  const effectiveDate = boundedText(value.effectiveDate, 10, 10);
  const sections = parseAgreementSections(value.sections);
  if (
    !code ||
    !isDocumentCode(code) ||
    !name ||
    !version ||
    !effectiveDate ||
    !DATE_ONLY.test(effectiveDate) ||
    !sections
  ) {
    return null;
  }
  const snapshot: ProviderAgreementSnapshot = {
    code,
    name,
    version,
    effectiveDate,
    sections,
  };
  if (value.acceptedAt != null) snapshot.acceptedAt = value.acceptedAt;
  return snapshot;
}

export function resolveProviderAgreementAcceptance(input: {
  clientVersion: string;
  current: ProviderAgreementSource;
  existing: Record<string, unknown> | null;
}): AgreementAcceptanceDecision {
  const clientVersion = input.clientVersion.trim();
  if (!clientVersion || clientVersion !== input.current.version) {
    return {action: "reject"};
  }

  const existing = input.existing;
  const existingVersion = typeof existing?.providerAgreementVersion === "string"
    ? existing.providerAgreementVersion.trim()
    : "";
  const alreadyAcceptedThisVersion =
    existing?.providerAgreementAcceptedAt != null &&
    existingVersion === input.current.version;
  if (alreadyAcceptedThisVersion) return {action: "preserve"};
  return {
    action: "record",
    acceptance: acceptanceFromAgreement(input.current),
  };
}

export function providerAgreementAcceptanceWrite(
  acceptance: StoredProviderAgreementAcceptance,
  acceptedAt: unknown,
): Record<string, unknown> {
  return {
    providerAgreementAccepted: true,
    providerAgreementCode: acceptance.providerAgreementCode,
    providerAgreementName: acceptance.providerAgreementName,
    providerAgreementVersion: acceptance.providerAgreementVersion,
    providerAgreementEffectiveDate: acceptance.providerAgreementEffectiveDate,
    providerAgreementTemplateCode: acceptance.providerAgreementTemplateCode,
    providerAgreementAcceptedAt: acceptedAt,
    providerAgreementSnapshot: {
      code: acceptance.providerAgreementSnapshot.code,
      name: acceptance.providerAgreementSnapshot.name,
      version: acceptance.providerAgreementSnapshot.version,
      effectiveDate: acceptance.providerAgreementSnapshot.effectiveDate,
      sections: cloneSections(acceptance.providerAgreementSnapshot.sections),
      acceptedAt,
    },
  };
}

function acceptanceFromAgreement(
  agreement: ProviderAgreementSource,
): StoredProviderAgreementAcceptance {
  const sections = cloneSections(agreement.sections);
  return {
    providerAgreementAccepted: true,
    providerAgreementCode: agreement.code,
    providerAgreementName: agreement.name,
    providerAgreementVersion: agreement.version,
    providerAgreementEffectiveDate: agreement.effectiveDate,
    providerAgreementTemplateCode: agreement.code,
    providerAgreementSnapshot: {
      code: agreement.code,
      name: agreement.name,
      version: agreement.version,
      effectiveDate: agreement.effectiveDate,
      sections,
    },
  };
}

function parseAgreementSections(
  value: unknown,
): ProviderAgreementSection[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 40) {
    return null;
  }
  const sections: ProviderAgreementSection[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const title = boundedText(entry.title, 2, 160);
    if (!title || !Array.isArray(entry.paragraphs)) return null;
    if (entry.paragraphs.length < 1 || entry.paragraphs.length > 12) {
      return null;
    }
    const paragraphs: string[] = [];
    for (const paragraph of entry.paragraphs) {
      const text = boundedText(paragraph, 1, 2000);
      if (!text) return null;
      paragraphs.push(text);
    }
    sections.push({title, paragraphs});
  }
  return sections;
}

function cloneSections(
  sections: readonly ProviderAgreementSection[],
): ProviderAgreementSection[] {
  return sections.map((section) => ({
    title: section.title,
    paragraphs: [...section.paragraphs],
  }));
}

function boundedText(
  value: unknown,
  minimum: number,
  maximum: number,
): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length < minimum || text.length > maximum) return null;
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
