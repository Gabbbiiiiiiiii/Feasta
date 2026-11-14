import type {
  AgreementPurpose,
  AgreementTypeRecord,
} from "@feasta/shared-types/documents/agreement-types";

export type {AgreementPurpose, AgreementTypeRecord};

export type DocumentCatalogStatus = "active" | "discontinued";

export type AgreementSection = {
  title: string;
  paragraphs: string[];
};

export type AgreementVersionStatus = "draft" | "current" | "archived";

export type AgreementVersionRecord = {
  /** Optional only for versions written before summary versioning. */
  summary?: string;
  version: string;
  name: string;
  effectiveDate: string;
  sections: AgreementSection[];
  status: AgreementVersionStatus;
  createdAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
};

export type AdminAgreementTemplate = {
  code: string;
  categoryCode: string;
  name: string;
  summary: string;
  version: string;
  effectiveDate: string;
  sections: AgreementSection[];
  agreementTypeCode: string | null;
  status: DocumentCatalogStatus;
  sortName: string;
  versions?: AgreementVersionRecord[];
};

export type AdminBusinessDocumentRule = {
  effect: "required" | "one_of";
  oneOfGroup: string;
  registrationScope: "any" | "registered_business" | "individual";
  serviceTypes: Array<"catering" | "addon" | "both">;
  serviceCategoryCodes: string[];
  excludeServiceCategoryCodes: string[];
};

export type AdminBusinessDocumentType = {
  code: string;
  categoryCode: string;
  name: string;
  description: string;
  status: DocumentCatalogStatus;
  sortName: string;
  rules: AdminBusinessDocumentRule[];
};

export type DocumentCatalogCodeInput = {
  code: string;
};

export type DocumentCatalogMutationResult = {
  deletedCode?: string;
  success: true;
  agreement?: AdminAgreementTemplate;
  agreementType?: AgreementTypeRecord;
};
