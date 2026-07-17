import {HttpsError} from "firebase-functions/v2/https";

export function requireObject(
  value: unknown,
  fieldName = "data",
): Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be an object.`,
    );
  }

  return value as Record<string, unknown>;
}

export function requireString(
  value: unknown,
  fieldName: string,
  options: {
    minLength?: number;
    maxLength?: number;
  } = {},
): string {
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be a string.`,
    );
  }

  const result = value.trim();

  if (
    options.minLength !== undefined &&
    result.length < options.minLength
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} is too short.`,
    );
  }

  if (
    options.maxLength !== undefined &&
    result.length > options.maxLength
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} is too long.`,
    );
  }

  return result;
}

export function requireNumber(
  value: unknown,
  fieldName: string,
  options: {
    min?: number;
    max?: number;
  } = {},
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be a valid number.`,
    );
  }

  if (
    options.min !== undefined &&
    value < options.min
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} is below the allowed minimum.`,
    );
  }

  if (
    options.max !== undefined &&
    value > options.max
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} exceeds the allowed maximum.`,
    );
  }

  return value;
}

export function requireBoolean(
  value: unknown,
  fieldName: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must be a boolean.`,
    );
  }

  return value;
}

export function requireEnum<T extends string>(
  value: unknown,
  fieldName: string,
  allowedValues: readonly T[],
): T {
  if (
    typeof value !== "string" ||
    !allowedValues.includes(value as T)
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} has an invalid value.`,
    );
  }

  return value as T;
}