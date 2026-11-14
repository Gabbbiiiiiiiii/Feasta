import {
  isTrustedAgreementType,
  type AgreementPurpose,
  type AgreementTypeRecord,
} from "./agreement-types.js";

export type PublishedAgreement = {
  code: string;
  name: string;
  summary: string;
  version: string;
  effectiveDate: string;
  sections: {title: string; paragraphs: string[]}[];
};

type Version = Omit<PublishedAgreement, "code" | "summary"> & {status: string; summary?: string};
type Lineage = {
  code: string;
  agreementTypeCode: unknown;
  versions: readonly Version[];
};

// Callers parse stored versions before selection. Count lineages before checking
// their content so a second draft-only/malformed lineage cannot hide ambiguity.
export function resolveCurrentAgreementByPurpose(
  purpose: Exclude<AgreementPurpose, "custom">,
  types: readonly AgreementTypeRecord[],
  agreements: readonly Lineage[],
): PublishedAgreement | null {
  const matchingTypes = types.filter((type) =>
    isTrustedAgreementType(type) && type.purpose === purpose && type.singleton,
  );
  if (matchingTypes.length !== 1) return null;
  const matches = agreements.filter((agreement) =>
    agreement.agreementTypeCode === matchingTypes[0].code,
  );
  if (matches.length !== 1) return null;
  const current = matches[0].versions.filter((version) => version.status === "current");
  if (current.length !== 1) return null;
  const version = current[0];
  return {
    code: matches[0].code,
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
