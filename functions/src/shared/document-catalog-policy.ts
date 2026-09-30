export const DOCUMENT_CATEGORIES = "documentCategories";
export const AGREEMENT_TEMPLATES = "agreementTemplates";
export const BUSINESS_DOCUMENT_TYPES = "businessDocumentTypes";
export {AGREEMENT_TYPES} from "./agreement-types.js";
const DOCUMENT_CODE_PATTERN =
  /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;

export type DocumentServiceType =
  "catering" | "addon" | "both";

export type BusinessDocumentRule = {
  effect: "required" | "one_of";
  oneOfGroup: string;
  registrationScope:
    "any" | "registered_business" | "individual";
  serviceTypes: DocumentServiceType[];
  serviceCategoryCodes: string[];
  excludeServiceCategoryCodes: string[];
};

export type BusinessDocumentCatalogRecord = {
  code: string;
  categoryCode: string;
  name: string;
  description: string;
  status: "active" | "discontinued";
  sortName: string;
  rules: BusinessDocumentRule[];
};

export type VerificationDocumentPolicy = {
  requiredAll: string[];
  requiredOneOf: string[][];
};

type ProviderDocumentContext = {
  providerServiceType: DocumentServiceType | null;
  serviceCategories: readonly string[];
  businessRegistrationType?:
    "individual" | "registered_business";
};

function rule(
  input: Partial<BusinessDocumentRule> &
    Pick<BusinessDocumentRule, "effect">,
): BusinessDocumentRule {
  return {
    effect: input.effect,
    oneOfGroup: input.oneOfGroup ?? "",
    registrationScope: input.registrationScope ?? "any",
    serviceTypes: input.serviceTypes ?? [],
    serviceCategoryCodes: input.serviceCategoryCodes ?? [],
    excludeServiceCategoryCodes:
      input.excludeServiceCategoryCodes ?? [],
  };
}

/**
 * Initial records migrated from the previous fixed verification policy.
 * Runtime checks read Firestore only. Administrators can replace these.
 */
export function initialBusinessDocumentTypes():
  BusinessDocumentCatalogRecord[] {

  return [
    documentType(
      "valid_id",
      "Valid government ID",
      [rule({effect: "required"})],
    ),
    documentType(
      "business_permit",
      "Business permit",
      [rule({
        effect: "required",
        registrationScope: "registered_business",
      })],
    ),
    documentType(
      "dti_registration",
      "DTI or SEC registration",
      [rule({
        effect: "required",
        registrationScope: "registered_business",
      })],
    ),
    documentType(
      "bir_registration",
      "BIR documentation",
      [rule({
        effect: "required",
        registrationScope: "registered_business",
      })],
    ),
    documentType(
      "sanitary_permit",
      "Sanitary permit",
      [
        rule({
          effect: "required",
          serviceTypes: ["catering", "both"],
        }),
      ],
    ),
    documentType(
      "mayors_permit",
      "Mayor's permit",
      [
        rule({
          effect: "required",
          serviceCategoryCodes: ["venue_provider"],
        }),
      ],
    ),
    documentType("other", "Other supporting document", []),
  ];
}

function documentType(
  code: string,
  name: string,
  rules: BusinessDocumentRule[],
): BusinessDocumentCatalogRecord {
  return {
    code,
    categoryCode: "business_documents",
    name,
    description: "",
    status: "active",
    sortName: name.toLowerCase(),
    rules,
  };
}

export function isDocumentCode(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 2 &&
    value.length <= 100 &&
    DOCUMENT_CODE_PATTERN.test(value);
}

export function resolveVerificationDocumentPolicy(
  catalog: readonly BusinessDocumentCatalogRecord[],
  input: ProviderDocumentContext,
): VerificationDocumentPolicy {
  const requiredAll: string[] = [];
  const groups = new Map<string, string[]>();

  for (const documentTypeRecord of catalog) {
    if (documentTypeRecord.status !== "active") continue;

    const matching = documentTypeRecord.rules.filter((entry) =>
      ruleMatches(entry, input),
    );
    if (matching.some((entry) => entry.effect === "required")) {
      requiredAll.push(documentTypeRecord.code);
      continue;
    }

    for (const entry of matching) {
      if (entry.effect !== "one_of" || !entry.oneOfGroup) continue;
      const group = groups.get(entry.oneOfGroup) ?? [];
      if (!group.includes(documentTypeRecord.code)) {
        group.push(documentTypeRecord.code);
      }
      groups.set(entry.oneOfGroup, group);
    }
  }

  return {
    requiredAll: [...new Set(requiredAll)].sort(),
    requiredOneOf: [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, codes]) => [...codes].sort())
      .filter((codes) => codes.length > 0),
  };
}

function ruleMatches(
  entry: BusinessDocumentRule,
  input: ProviderDocumentContext,
): boolean {
  if (
    entry.registrationScope === "individual" &&
    input.businessRegistrationType !== "individual"
  ) {
    return false;
  }

  if (
    entry.registrationScope === "registered_business" &&
    input.businessRegistrationType === "individual"
  ) {
    return false;
  }

  if (
    entry.serviceTypes.length > 0 &&
    (
      input.providerServiceType === null ||
      !entry.serviceTypes.includes(input.providerServiceType)
    )
  ) {
    return false;
  }

  if (
    entry.serviceCategoryCodes.length > 0 &&
    !entry.serviceCategoryCodes.some((code) =>
      input.serviceCategories.includes(code),
    )
  ) {
    return false;
  }

  return !entry.excludeServiceCategoryCodes.some((code) =>
    input.serviceCategories.includes(code),
  );
}

export function providerDocumentContext(
  provider: Readonly<Record<string, unknown>>,
): ProviderDocumentContext {
  const serviceType = provider.providerServiceType;
  const categories = Array.isArray(provider.serviceCategories) ?
    provider.serviceCategories.filter(
      (value): value is string => typeof value === "string",
    ) :
    typeof provider.providerCategory === "string" ?
      [provider.providerCategory] :
      [];
  const registration = provider.businessRegistrationType;

  return {
    providerServiceType:
      serviceType === "catering" ||
      serviceType === "addon" ||
      serviceType === "both" ?
        serviceType :
        null,
    serviceCategories: categories,
    businessRegistrationType:
      registration === "individual" ||
      registration === "registered_business" ?
        registration :
        undefined,
  };
}

export function parseBusinessDocumentType(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined,
): BusinessDocumentCatalogRecord | null {
  if (
    !data ||
    data.code !== id ||
    !isDocumentCode(data.categoryCode) ||
    typeof data.name !== "string" ||
    !data.name.trim() ||
    (data.status !== "active" && data.status !== "discontinued") ||
    !Array.isArray(data.rules)
  ) {
    return null;
  }

  const rules = data.rules.flatMap((ruleValue) => {
    const parsed = parseRule(ruleValue);
    return parsed ? [parsed] : [];
  });
  if (rules.length !== data.rules.length) return null;

  const name = data.name.trim();
  return {
    code: id,
    categoryCode: data.categoryCode,
    name,
    description: typeof data.description === "string" ?
      data.description.trim() :
      "",
    status: data.status,
    sortName: typeof data.sortName === "string" && data.sortName.trim() ?
      data.sortName.trim() :
      name.toLowerCase(),
    rules,
  };
}

function parseRule(value: unknown): BusinessDocumentRule | null {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.effect !== "required" && record.effect !== "one_of") {
    return null;
  }
  if (
    record.registrationScope !== "any" &&
    record.registrationScope !== "registered_business" &&
    record.registrationScope !== "individual"
  ) {
    return null;
  }
  if (
    typeof record.oneOfGroup !== "string" ||
    (
      record.effect === "one_of" &&
      !isDocumentCode(record.oneOfGroup)
    )
  ) {
    return null;
  }

  const serviceTypes = stringList(record.serviceTypes);
  const serviceCategoryCodes = stringList(record.serviceCategoryCodes);
  const excludeServiceCategoryCodes = stringList(
    record.excludeServiceCategoryCodes,
  );
  if (
    !serviceTypes ||
    !serviceCategoryCodes ||
    !excludeServiceCategoryCodes ||
    serviceTypes.some((type) =>
      type !== "catering" && type !== "addon" && type !== "both",
    ) ||
    serviceCategoryCodes.some((code) => !isDocumentCode(code)) ||
    excludeServiceCategoryCodes.some((code) => !isDocumentCode(code))
  ) {
    return null;
  }

  return {
    effect: record.effect,
    oneOfGroup: record.oneOfGroup,
    registrationScope: record.registrationScope,
    serviceTypes: serviceTypes as DocumentServiceType[],
    serviceCategoryCodes,
    excludeServiceCategoryCodes,
  };
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.some((item) => typeof item !== "string")) return null;
  return value as string[];
}
