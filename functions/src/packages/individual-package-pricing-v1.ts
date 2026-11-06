/**
 * Private individual-item package draft pricing snapshot.
 *
 * Does not authorize canonical writes, publication, checkout,
 * booking, or payment calculations.
 *
 * All prices are integer Philippine centavos.
 */

import {
  parseIndividualFoodItemsV2,
  IndividualFoodItemValidationError,
  type IndividualFoodItemV2,
} from "./individual-food-items-v2.js";

export interface IndividualPackagePricingSnapshotV1 {
  pricingSchemaVersion: 1;
  offerStructure: "individual";
  individualFoodItems: IndividualFoodItemV2[];
}

export function prepareIndividualPackagePricingSnapshotV1(
  value: unknown,
): IndividualPackagePricingSnapshotV1 {
  const items = parseIndividualFoodItemsV2(value);

  // One individual package represents exactly one food product.
  // Each product may have multiple serving-size variants.
  if (items.length !== 1) {
    throw new IndividualFoodItemValidationError();
  }

  // The parser returns fully validated, normalized plain values.
  // Do not invent a scalar package price or pricingModel here.
  return {
    pricingSchemaVersion: 1,
    offerStructure: "individual",
    individualFoodItems: items,
  };
}