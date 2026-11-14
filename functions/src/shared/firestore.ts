import {getFirestore} from "firebase-admin/firestore";

export const db = getFirestore();

export function documentExists(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value);
}