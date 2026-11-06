/**
 * FEASTA private individual-package pricing write validation.
 *
 * This is a draft-only contract, not an active canonical writer.
 * No customer booking, checkout, publication or payment authority.
 *
 * Never interpret individual-item prices as package-level prices.
 */

import {
  prepareIndividualPackagePricingSnapshotV1,
  type IndividualPackagePricingSnapshotV1,
} from "./individual-package-pricing-v1.js";

export interface IndividualPackageDraftPricingWriteV1 {
  draftPricingContractVersion: 1;
  pricing: IndividualPackagePricingSnapshotV1;
}

const forbiddenFields = [
  "price",
  "pricingModel",
  "serviceOptions",
  "unitPrice",
  "totalPrice",
  "bookingPrice",
  "amount",
  "amountCentavos",
  "isPublished",
  "isActive",
  "providerPubliclyVisible",
] as const;

export function parseIndividualPackageDraftPricingWriteV1(
  value: unknown,
): IndividualPackageDraftPricingWriteV1 {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new Error("INVALID_INDIVIDUAL_PACKAGE_DRAFT");
  }

  const input = value as Record<string, unknown>;

  if (
    Reflect.ownKeys(input).some((key) => typeof key !== "string") ||
    Object.values(Object.getOwnPropertyDescriptors(input)).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor)
    )
  ) {
    throw new Error("INVALID_INDIVIDUAL_PACKAGE_DRAFT");
  }

  // Only the explicitly defined draft-pricing fields are accepted.
  const keys = Object.keys(input);

  if (
    keys.length !== 2 ||
    !Object.hasOwn(input, "draftPricingContractVersion") ||
    !Object.hasOwn(input, "individualFoodItems") ||
    forbiddenFields.some((field) => Object.hasOwn(input, field))
  ) {
    throw new Error("INVALID_INDIVIDUAL_PACKAGE_DRAFT");
  }

  if (input.draftPricingContractVersion !== 1) {
    throw new Error("INVALID_INDIVIDUAL_PACKAGE_DRAFT");
  }

  return {
    draftPricingContractVersion: 1,
    pricing: prepareIndividualPackagePricingSnapshotV1(
      input.individualFoodItems,
    ),
  };
}
/**
 * Prepare validated individual-item prices from private editor progress.
 *
 * This function is intentionally Firebase-free and does not authorize
 * canonical package saving, publication, booking, or checkout.
 */
export function individualCanonicalPricingFromProgress(
  progress: unknown,
): IndividualPackageDraftPricingWriteV1["pricing"] {
  const invalid = (): never => {
    throw new Error("INVALID_INDIVIDUAL_PACKAGE_DRAFT");
  };

  if (
    progress === null ||
    typeof progress !== "object" ||
    Array.isArray(progress) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(progress))
  ) {
    return invalid();
  }

  const data = progress as Record<string, unknown>;

  if (
    Object.values(Object.getOwnPropertyDescriptors(data)).some(
      (descriptor) => !descriptor.enumerable || !("value" in descriptor)
    ) ||
    Reflect.ownKeys(data).some((key) => typeof key !== "string") ||
    data.offerStructure !== "individual" ||
    (
      Object.hasOwn(data, "individualFoodItems") &&
      Object.hasOwn(data, "individualFoodDraft")
    )
  ) {
    return invalid();
  }

  const integerText = (value: unknown): number => {
    if (typeof value !== "string" || !/^[0-9]+$/.test(value)) {
      return invalid();
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) return invalid();
    return parsed;
  };

  const centavosText = (value: unknown): number => {
    if (typeof value !== "string") return invalid();
    const match = /^([0-9]+)(?:\.([0-9]{1,2}))?$/.exec(value);
    if (!match) return invalid();

    const whole = Number(match[1]);
    const cents = Number((match[2] ?? "").padEnd(2, "0"));
    const result = whole * 100 + cents;

    if (!Number.isSafeInteger(result)) return invalid();
    return result;
  };

  let items: unknown = data.individualFoodItems;

  if (Object.hasOwn(data, "individualFoodDraft")) {
    const raw = data.individualFoodDraft;
    if (
      !raw || typeof raw !== "object" || Array.isArray(raw) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(raw))
    ) {
      return invalid();
    }
    const food = raw as Record<string, unknown>;
    if (
      Reflect.ownKeys(food).some((key) => typeof key !== "string") ||
      Object.values(Object.getOwnPropertyDescriptors(food)).some(
        (descriptor) => !descriptor.enumerable || !("value" in descriptor)
      ) ||
      !Array.isArray(food.servingOptions)
    ) {
      return invalid();
    }

    items = [{
      id: food.id,
      name: food.name,
      servingOptions: food.servingOptions.map((rawOption: unknown) => {
        if (
          !rawOption ||
          typeof rawOption !== "object" ||
          Array.isArray(rawOption) ||
          ![Object.prototype, null].includes(Object.getPrototypeOf(rawOption))
        ) {
          return invalid();
        }
        const option = rawOption as Record<string, unknown>;
        if (
          Reflect.ownKeys(option).some((key) => typeof key !== "string") ||
          Object.values(Object.getOwnPropertyDescriptors(option)).some(
            (descriptor) => !descriptor.enumerable || !("value" in descriptor)
          )
        ) {
          return invalid();
        }
        return {
          id: option.id,
          name: option.name,
          minimumServings: integerText(option.minimumServingsText),
          maximumServings: integerText(option.maximumServingsText),
          priceCentavos: centavosText(option.priceText),
          minimumQuantity: integerText(option.minimumQuantityText),
          maximumQuantity: integerText(option.maximumQuantityText),
        };
      }),
    }];
  }

  try {
    return parseIndividualPackageDraftPricingWriteV1({
      draftPricingContractVersion: 1,
      individualFoodItems: items,
    }).pricing;
  } catch {
    return invalid();
  }
}