import {serviceClassificationLabel} from "@/lib/service-categories/service-classification-label";
import {
  PROVIDER_SERVICE_TYPES,
  type ProviderServiceType,
} from "@feasta/shared-types";

export const PROVIDER_SERVICE_TYPE_OPTIONS = PROVIDER_SERVICE_TYPES.map(
  (value) => ({value, label: providerServiceTypeLabel(value)}),
);


export function providerServiceTypeLabel(value: ProviderServiceType): string {
  return serviceClassificationLabel(value);
}


export function humanizeProviderValue(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}
