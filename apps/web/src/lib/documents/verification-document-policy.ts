export type DocumentServiceType = "catering" | "addon" | "both";

export type BusinessDocumentRule = {
  effect: "required" | "one_of";
  oneOfGroup: string;
  registrationScope: "any" | "registered_business" | "individual";
  serviceTypes: DocumentServiceType[];
  serviceCategoryCodes: string[];
  excludeServiceCategoryCodes: string[];
};

export type BusinessDocumentCatalogRecord = {
  code: string;
  name: string;
  status: "active" | "discontinued";
  rules: readonly BusinessDocumentRule[];
};

export type VerificationDocumentPolicy = {
  requiredAll: string[];
  requiredOneOf: string[][];
};

export function resolveVerificationDocumentPolicy(
  catalog: readonly BusinessDocumentCatalogRecord[],
  input: {
    providerServiceType: DocumentServiceType | null;
    serviceCategories: readonly string[];
    businessRegistrationType?: "individual" | "registered_business";
  },
): VerificationDocumentPolicy {
  const requiredAll: string[] = [];
  const groups = new Map<string, string[]>();

  for (const documentType of catalog) {
    if (documentType.status !== "active") continue;
    const matching = documentType.rules.filter((entry) =>
      ruleMatches(entry, input),
    );
    if (matching.some((entry) => entry.effect === "required")) {
      requiredAll.push(documentType.code);
      continue;
    }
    for (const entry of matching) {
      if (entry.effect !== "one_of" || !entry.oneOfGroup) continue;
      const group = groups.get(entry.oneOfGroup) ?? [];
      if (!group.includes(documentType.code)) {
        group.push(documentType.code);
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
  input: {
    providerServiceType: DocumentServiceType | null;
    serviceCategories: readonly string[];
    businessRegistrationType?: "individual" | "registered_business";
  },
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
