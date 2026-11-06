/**
 * FEASTA individual food item foundation.
 * Private development contract only.
 * Not authorized for package writes, publishing, or booking.
 */

export interface IndividualServingOptionV2 {
  id: string;
  name: string;
  minimumServings: number;
  maximumServings: number;
  priceCentavos: number;
  minimumQuantity: number;
  maximumQuantity: number;
}

export interface IndividualFoodItemV2 {
  id: string;
  name: string;
  servingOptions: IndividualServingOptionV2[];
}

export class IndividualFoodItemValidationError extends Error {
  constructor() {
    super("INVALID_INDIVIDUAL_FOOD_ITEMS");
    this.name = "IndividualFoodItemValidationError";
  }
}

function invalid(): never {
  throw new IndividualFoodItemValidationError();
}

function exact(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) return invalid();

  const record = value as Record<string, unknown>;

  if (
    Object.values(Object.getOwnPropertyDescriptors(record)).some(
      (descriptor) =>
        !descriptor.enumerable || !("value" in descriptor)
    ) ||
    Object.keys(record).length !== fields.length ||
    fields.some((field) => !Object.hasOwn(record, field)) ||
    Object.keys(record).some((field) => !fields.includes(field))
  ) return invalid();

  return record;
}

function id(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{1,64}$/u.test(value)
  ) return invalid();
  return value;
}

function label(value: unknown, max: number): string {
  if (
    typeof value !== "string" ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  ) return invalid();

  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized || normalized.length > max) return invalid();
  return normalized;
}

function key(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-PH");
}

function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  ) return invalid();

  return value;
}

export function parseIndividualFoodItemsV2(
  value: unknown,
): IndividualFoodItemV2[] {
  if (!Array.isArray(value) || value.length > 20) return invalid();

  const itemIds = new Set<string>();
  const itemNames = new Set<string>();

  return value.map((input): IndividualFoodItemV2 => {
    const item = exact(input, ["id", "name", "servingOptions"]);
    const itemId = id(item.id);
    const name = label(item.name, 120);
    const nameKey = key(name);

    if (
      itemIds.has(itemId) ||
      itemNames.has(nameKey)
    ) return invalid();

    itemIds.add(itemId);
    itemNames.add(nameKey);

    if (
      !Array.isArray(item.servingOptions) ||
      item.servingOptions.length < 1 ||
      item.servingOptions.length > 8
    ) return invalid();

    const optionIds = new Set<string>();
    const optionNames = new Set<string>();

    const servingOptions = item.servingOptions.map(
      (inputOption): IndividualServingOptionV2 => {
        const option = exact(inputOption, [
          "id", "name", "minimumServings", "maximumServings",
          "priceCentavos", "minimumQuantity", "maximumQuantity",
        ]);

        const optionId = id(option.id);
        const optionName = label(option.name, 80);
        const optionKey = key(optionName);

        if (
          optionIds.has(optionId) ||
          optionNames.has(optionKey)
        ) return invalid();

        optionIds.add(optionId);
        optionNames.add(optionKey);

        const minimumServings = integer(
          option.minimumServings, 1, 10000
        );
        const maximumServings = integer(
          option.maximumServings, 1, 10000
        );
        const priceCentavos = integer(
          option.priceCentavos, 1, 1000000000
        );
        const minimumQuantity = integer(
          option.minimumQuantity, 1, 100
        );
        const maximumQuantity = integer(
          option.maximumQuantity, 1, 100
        );

        if (
          minimumServings > maximumServings ||
          minimumQuantity > maximumQuantity ||
          !Number.isSafeInteger(priceCentavos * maximumQuantity) ||
          priceCentavos * maximumQuantity > 1000000000
        ) return invalid();

        return {
          id: optionId,
          name: optionName,
          minimumServings,
          maximumServings,
          priceCentavos,
          minimumQuantity,
          maximumQuantity,
        };
      }
    );

    return {id: itemId, name, servingOptions};
  });
}