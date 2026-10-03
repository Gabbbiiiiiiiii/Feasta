import type {
  ServiceCategoryCapacityCapabilities,
  ServiceCategoryCode,
  ServiceCategoryStatus,
} from "@feasta/shared-types";

export type ServiceCategoryOption = {
  code: ServiceCategoryCode;
  name: string;
  serviceType: "catering" | "addon";
  capacityCapabilities?: ServiceCategoryCapacityCapabilities;
  status: ServiceCategoryStatus;
};

export function serviceCategoryNameMap(
  categories: readonly ServiceCategoryOption[],
): ReadonlyMap<ServiceCategoryCode, string> {
  return new Map(
    categories.map((category) => [
      category.code,
      category.name,
    ]),
  );
}

export function serviceCategoryName(
  code: ServiceCategoryCode,
  categories: readonly ServiceCategoryOption[],
): string {
  return serviceCategoryNameMap(categories).get(code) ??
    humanizeServiceCategoryCode(code);
}

function humanizeServiceCategoryCode(
  code: ServiceCategoryCode,
): string {
  return code
    .split("_")
    .filter(Boolean)
    .map(
      (part) =>
        `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`,
    )
    .join(" ");
}
