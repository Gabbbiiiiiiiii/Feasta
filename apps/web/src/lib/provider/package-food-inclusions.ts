export const SUGGESTED_FOOD_CATEGORIES = [
  "Chicken", "Pork", "Beef", "Fish/Seafood", "Vegetables", "Pasta/Noodles", "Desserts", "Other",
];

export type PackageDish = {id: string; category: string; name: string; raw: string};

export function categoryNameError(value: string): string | null {
  if (!value.trim()) return "Enter a category name.";
  if (value.trim().length > 120) return "Use at most 120 characters for the category.";
  if (/[:\p{Cc}\p{Cf}]/u.test(value)) return "Category names cannot contain colons or control characters.";
  return null;
}

export function categoryKey(value: string): string {
  return value.trim().replace(/\s+/gu, " ").normalize("NFKC").toLocaleLowerCase("en-PH");
}

/** Preserve the original string, including legacy delimiters, until explicitly edited. */
export function parsePackageDishes(value: string | readonly string[]): PackageDish[] {
  if (value === "") return [];
  const inclusions = typeof value === "string" ? value.split(/\r?\n/u) : value;
  return inclusions.map((raw, index) => {
    const delimiter = raw.indexOf(": ");
    const category = delimiter > 0 ? raw.slice(0, delimiter) : "";
    const categorized = category !== "" && !categoryNameError(category) && raw.slice(delimiter + 2).trim() !== "";
    return {id: "dish-" + index, raw, category: categorized ? category : "",
      name: categorized ? raw.slice(delimiter + 2) : raw};
  });
}

export function serializePackageDish(category: string, name: string): string {
  return category.trim() ? category.trim() + ": " + name.trim() : name.trim();
}

export function foodInclusionsError(value: string | readonly string[]): string | null {
  const rows = parsePackageDishes(value);
  if (rows.length > 50) return "Keep at most 50 food inclusions. Remove dishes explicitly to continue.";
  if (rows.some((row) => !row.raw.trim() || row.raw.length > 160 || /[\p{Cc}\p{Cf}]/u.test(row.raw))) {
    return "Each food inclusion must contain 1–160 characters without control characters. Edit the affected dish to continue.";
  }
  const keys = rows.map((row) => categoryKey(row.raw));
  if (new Set(keys).size !== keys.length) return "Duplicate food inclusions found. Edit or remove duplicates to continue.";
  return null;
}
