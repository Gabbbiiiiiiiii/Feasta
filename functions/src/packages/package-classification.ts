import {HttpsError} from "firebase-functions/v2/https";

export type PackageClassification = {
  offerStructure?: "fixed" | "customizable" | "individual";
  packageStyle?: string;
};

/**
 * Optional metadata for historical compatibility.
 * Never provides pricing, publication, or booking authority.
 */
export function parsePackageClassification(
  value: Readonly<Record<string, unknown>>,
): PackageClassification {
  const result: PackageClassification = {};

  if (Object.hasOwn(value, "offerStructure")) {
    const structure = value.offerStructure;

    if (
      structure !== "fixed" &&
      structure !== "customizable" &&
      structure !== "individual"
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Choose a valid package structure.",
        {reason: "INVALID_OFFER_STRUCTURE"},
      );
    }

    result.offerStructure = structure;
  }

  if (Object.hasOwn(value, "packageStyle")) {
    const style = value.packageStyle;

    if (
      typeof style !== "string" ||
      style !== style.trim() ||
      [...style].length < 2 ||
      [...style].length > 80 ||
      /[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u.test(style)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Package style must contain 2 to 80 safe characters.",
        {reason: "INVALID_PACKAGE_STYLE"},
      );
    }

    result.packageStyle = style;
  }

  return result;
}
