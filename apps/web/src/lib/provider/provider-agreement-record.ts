export type ProviderAgreementSection = {
  title: string;
  paragraphs: string[];
};

export type ProviderAgreementSnapshot = {
  code: string;
  name: string;
  version: string;
  effectiveDate: string;
  sections: ProviderAgreementSection[];
  acceptedAt?: unknown;
};

export type ProviderAgreementPdfAcceptance = {
  businessName: string;
  representativeName: string;
  acceptedAtLabel: string;
  providerId: string | null;
};

export type ProviderAgreementPdfModel = {
  name: string;
  version: string;
  effectiveDate: string;
  sections: ProviderAgreementSection[];
  acceptance: ProviderAgreementPdfAcceptance | null;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const DOCUMENT_CODE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const PROVIDER_ID = /^[A-Za-z0-9_-]{1,128}$/u;

export function authorizedRepresentativeName(
  firstName: string,
  lastName: string,
): string {
  return [firstName, lastName]
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(" ");
}

export function parseProviderAgreementSnapshot(
  value: unknown,
): ProviderAgreementSnapshot | null {
  if (!isRecord(value)) return null;
  const code = boundedText(value.code, 2, 100);
  const name = boundedText(value.name, 2, 120);
  const version = boundedText(value.version, 1, 40);
  const effectiveDate = boundedText(value.effectiveDate, 10, 10);
  const sections = parseSections(value.sections);
  if (
    !code ||
    !DOCUMENT_CODE.test(code) ||
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

export function displayProviderId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return PROVIDER_ID.test(trimmed) ? trimmed : null;
}

export function formatTrustedAcceptanceTimestamp(value: unknown): string | null {
  const date = trustedTimestampDate(value);
  if (!date) return null;
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function selectProviderAgreementPdf(input: {
  copy: "current" | "accepted";
  current: {
    name: string;
    version: string;
    effectiveDate: string;
    sections: ProviderAgreementSection[];
  } | null;
  accepted: {
    snapshot: ProviderAgreementSnapshot;
    businessName: string;
    representativeName: string;
    providerId: string | null;
  } | null;
}): ProviderAgreementPdfModel | null {
  if (input.copy === "accepted") {
    const accepted = input.accepted;
    if (!accepted) return null;
    const acceptedAtLabel = formatTrustedAcceptanceTimestamp(
      accepted.snapshot.acceptedAt,
    );
    if (!acceptedAtLabel) return null;
    return {
      name: accepted.snapshot.name,
      version: accepted.snapshot.version,
      effectiveDate: accepted.snapshot.effectiveDate,
      sections: cloneSections(accepted.snapshot.sections),
      acceptance: {
        businessName: accepted.businessName.trim(),
        representativeName: accepted.representativeName.trim(),
        acceptedAtLabel,
        providerId: displayProviderId(accepted.providerId),
      },
    };
  }
  if (!input.current || input.current.sections.length === 0) return null;
  return {
    name: input.current.name,
    version: input.current.version,
    effectiveDate: input.current.effectiveDate,
    sections: cloneSections(input.current.sections),
    acceptance: null,
  };
}

export function providerAgreementPdfFilename(version: string): string {
  const cleaned = version
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 48);
  return `FEASTA-Provider-Agreement-v${cleaned || "current"}.pdf`;
}

export function providerAgreementContentDisposition(version: string): string {
  return `attachment; filename="${providerAgreementPdfFilename(version)}"`;
}

export function normalizePdfPunctuation(value: string): string {
  return value
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, "\"")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ");
}

function trustedTimestampDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (!isRecord(value)) return null;
  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value.seconds === "number" && Number.isFinite(value.seconds)) {
    const date = new Date(value.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function parseSections(value: unknown): ProviderAgreementSection[] | null {
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
