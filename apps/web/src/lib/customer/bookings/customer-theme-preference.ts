export const CUSTOMER_THEME_PRESETS = [
  "Elegant",
  "Garden",
  "Rustic",
  "Minimalist",
  "Modern",
  "Classic",
  "Filipiniana",
  "Boho",
] as const;

export type CustomerThemePreferenceMode =
  | "none"
  | "preset"
  | "custom";

export type CustomerThemePreferenceDraft = {
  mode: CustomerThemePreferenceMode;
  themeName: string;
  description: string;
  referenceSetupId: string | null;
};

export function emptyCustomerThemePreference():
  CustomerThemePreferenceDraft {
  return {
    mode: "none",
    themeName: "",
    description: "",
    referenceSetupId: null,
  };
}