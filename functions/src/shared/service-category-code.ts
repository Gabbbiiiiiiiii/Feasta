const SERVICE_CATEGORY_CODE_PATTERN =
  /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;

export type ServiceCategoryCode = string;

export function isServiceCategoryCode(
  value: unknown,
): value is ServiceCategoryCode {
  return typeof value === "string" &&
    value.length >= 2 &&
    value.length <= 100 &&
    SERVICE_CATEGORY_CODE_PATTERN.test(value);
}
