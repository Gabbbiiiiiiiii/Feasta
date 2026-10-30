/** FEASTA V2 PRIVATE DRAFT. Not a booking/publishing contract. */
import type {FoodChoiceGroupV2, FoodChoiceOptionV2} from "@feasta/shared-types/provider-package-v2";

export class FoodChoiceValidationError extends Error {
  constructor() { super("INVALID_FOOD_CHOICE_GROUP"); this.name = "FoodChoiceValidationError"; }
}

const invalid = (): never => {throw new FoodChoiceValidationError();};
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const norm = (value: string) => value.trim().replace(/\s+/gu, " ").normalize("NFKC").toLocaleLowerCase("en-PH");
const stableId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/u.test(value);
function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      !([Object.prototype, null].includes(Object.getPrototypeOf(value)))) return invalid();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== fields.length ||
      Object.keys(data).some((key) => !fields.includes(key)) ||
      fields.some((key) => !own(data, key))) return invalid();
  return data;
}
function title(value: unknown, max: number, allowIncomplete: boolean): string {
  if (typeof value !== "string" || value.length > max || /[\p{Cc}\p{Cf}]/u.test(value) ||
      (!allowIncomplete && !value.trim())) return invalid();
  return value;
}
/** Validate choice metadata independent of the legacy foodInclusions array.
 * `allowIncomplete` is only for unbound editor progress, never a package write.
 * The backend must revalidate with allowIncomplete=false before creating a draft.
 */
export function parseFoodChoiceGroupsV2(value: unknown, allowIncomplete = false): FoodChoiceGroupV2[] {
  if (!Array.isArray(value) || value.length > 10) return invalid();
  const seenGroupIds = new Set<string>();
  const seenTitles = new Set<string>();
  let totalOptions = 0;
  return value.map((group): FoodChoiceGroupV2 => {
    const row = record(group, ["id", "title", "selectionCount", "options"]);
    if (!stableId(row.id) || seenGroupIds.has(row.id)) return invalid();
    seenGroupIds.add(row.id);
    const groupTitle = title(row.title, 80, allowIncomplete);
    if (groupTitle.trim()) {
      const key = norm(groupTitle);
      if (seenTitles.has(key)) return invalid();
      seenTitles.add(key);
    }
    if (!Array.isArray(row.options) || row.options.length > 10 ||
        (!allowIncomplete && row.options.length < 2)) return invalid();
    totalOptions += row.options.length;
    if (totalOptions > 50) return invalid();
    if (typeof row.selectionCount !== "number" || !Number.isSafeInteger(row.selectionCount) || row.selectionCount < 1 ||
        row.selectionCount > 10 ||
        (!allowIncomplete && row.selectionCount > row.options.length)) return invalid();
    const seenIds = new Set<string>();
    const seenOptions = new Set<string>();
    const options = row.options.map((option): FoodChoiceOptionV2 => {
      const dish = record(option, ["id", "name"]);
      if (!stableId(dish.id) || seenIds.has(dish.id)) return invalid();
      seenIds.add(dish.id);
      const name = title(dish.name, 120, allowIncomplete);
      if (name.trim()) {
        const key = norm(name);
        if (seenOptions.has(key)) return invalid();
        seenOptions.add(key);
      }
      return {id: dish.id, name};
    });
    return {id: row.id, title: groupTitle, selectionCount: row.selectionCount as number, options};
  });
}
