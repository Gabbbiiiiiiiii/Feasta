export type PackageOccasionOption = {id: string; label: string; categoryCodes: string[]};
export type PackageOccasionOptions = {
  options: PackageOccasionOption[];
  catalogRevision: number;
  providerEligibilityRevision: number;
  maxSpecificOccasions: number;
};

/** Display choices only; never a publication or write authorization. */
export function packageOccasionChoices(catalog: PackageOccasionOptions | null | undefined, category: string) {
  return catalog?.options.filter((option) => option.categoryCodes.includes(category)) ?? [];
}
