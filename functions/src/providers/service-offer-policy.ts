export function offerNameKey(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-PH");
}
export function offerNameError(value: string): string | null {
  const name=value.trim();
  if (name.length<3 || name.length>80) return "Package name must contain 3 to 80 characters.";
  if (!/\p{L}/u.test(name)) return "Package name must contain at least one letter.";
  if (/(.)\1{4,}/u.test(name)) {
    return "Use a recognizable package name without five repeated characters in a row.";
  }
  if (/[\p{Cc}\p{Cf}]/u.test(name)) return "Remove unsupported characters from the package name.";
  return null;
}
export function offerDescriptionError(value: string): string | null {
  const description=value.trim();
  return description && (description.length<15 || description.length>500)
    ? "About this package must contain 15 to 500 characters, or be left blank." : null;
}
export function serviceGuestLimitsError(
  pricingType: string, minimum: unknown, maximum: unknown,
): string | null {
  if (pricingType!=="per_guest") return null;
  return typeof minimum!=="number" || typeof maximum!=="number" ||
    !Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum) ||
    minimum<10 || maximum<minimum || maximum>10000
    ? "Enter whole guest limits: minimum at least 10, " +
      "maximum at least the minimum and no more than 10,000." : null;
}
