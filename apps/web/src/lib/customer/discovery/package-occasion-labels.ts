export type PackageOccasionDisplaySource = {
  occasionScope?: "specific" | "all";
  occasionMatchIds?: readonly string[];
  occasionIds?: readonly string[];
  eventType?: string | null;
  customOccasionLabels?: readonly string[];
};

/** Format display occasion labels for a package, expanding "other" into storefront custom labels when provided. */
export function formatPackageOccasionLabels(
  source: PackageOccasionDisplaySource,
  humanize: (value: string) => string,
  options?: {allLabel?: string},
): string[] {
  if (source.occasionScope === "all") {
    return [options?.allLabel ?? "Fits All"];
  }
  const ids = source.occasionMatchIds?.length
    ? source.occasionMatchIds
    : source.occasionIds?.length
      ? source.occasionIds
      : source.eventType
        ? [source.eventType]
        : [];
  const custom = (source.customOccasionLabels ?? []).map((label) => label.trim()).filter(Boolean);
  if (!custom.length || !ids.includes("other")) {
    return ids.map(humanize);
  }
  const labels: string[] = [];
  const seen = new Set<string>();
  const add = (label: string) => {
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    labels.push(label);
  };
  for (const id of ids) {
    if (id === "other") {
      for (const label of custom) add(label);
    } else {
      add(humanize(id));
    }
  }
  return labels;
}

/** Label a canonical eventType while keeping "other" as the submitted booking ID. */
export function formatBookingEventTypeLabel(
  eventType: string,
  customOccasionLabels: readonly string[] | undefined,
  humanize: (value: string) => string,
): string {
  const custom = (customOccasionLabels ?? []).map((label) => label.trim()).filter(Boolean);
  if (eventType === "other" && custom.length > 0) {
    return custom.join(", ");
  }
  return humanize(eventType);
}
