import type {ProviderServiceType} from "@feasta/shared-types";

const LABELS: Record<ProviderServiceType, string> = {
  catering: "Catering",
  addon: "Other Event Services",
  both: "Catering & Other Event Services",
};

/** Presentation only: persisted classifications and callable payloads stay unchanged. */
export function serviceClassificationLabel(value: unknown): string {
  if (value === "catering" || value === "addon" || value === "both") {
    return LABELS[value];
  }
  return "Unknown service classification";
}
