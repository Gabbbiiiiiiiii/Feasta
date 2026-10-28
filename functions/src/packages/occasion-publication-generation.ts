/**
 * Server-owned catalog-generation gate for legacy package publication.
 *
 * The caller MUST read occasionCatalog/current INSIDE THE SAME Firestore
 * transaction as its public package write. A pure check outside that read-set
 * cannot fence concurrent transitions.
 *
 * This is NOT approval evidence, eligibility evidence, or permission to publish
 * V2 packages. Existing V2 publication safeguards remain separate.
 */
export function stableOccasionPublicationGeneration(value: unknown): number | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Readonly<Record<string, unknown>>;
  if (record.activationState !== "stable") return null;
  if (typeof record.revision !== "number" ||
    !Number.isSafeInteger(record.revision) || record.revision < 1) {
    return null;
  }
  return record.revision;
}

/** The caller must read this occasion in the same transaction as the new offer/booking. */
export function activeOccasionAuthority(value: unknown, occasionId: string,
  serviceCategoryCode?: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return row.id === occasionId && row.moderationState === "approved" &&
    row.active === true && typeof row.revision === "number" &&
    Number.isSafeInteger(row.revision) && row.revision > 0 &&
    Array.isArray(row.applicableServiceCategoryCodes) &&
    row.applicableServiceCategoryCodes.length > 0 &&
    row.applicableServiceCategoryCodes.every((code) =>
      typeof code === "string" && /^[a-z][a-z0-9_]{1,63}$/u.test(code)) &&
    new Set(row.applicableServiceCategoryCodes).size === row.applicableServiceCategoryCodes.length &&
    (serviceCategoryCode === undefined || row.applicableServiceCategoryCodes.includes(serviceCategoryCode));
}
