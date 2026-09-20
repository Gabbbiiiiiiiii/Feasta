import {
  PROVIDER_SERVICE_TYPES,
  type ProviderServiceType,
} from "@feasta/shared-types";

export const PROVIDER_SERVICE_TYPE_OPTIONS = PROVIDER_SERVICE_TYPES.map(
  (value) => ({value, label: providerServiceTypeLabel(value)}),
);


export function providerServiceTypeLabel(value: ProviderServiceType): string {
  if (value === "catering") return "Catering";
  if (value === "addon") return "Event services";
  return "Catering and event services";
}


export function humanizeProviderValue(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
