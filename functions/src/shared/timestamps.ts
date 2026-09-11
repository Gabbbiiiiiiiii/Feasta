import {
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";

export function serverTimestamp(): FieldValue {
  return FieldValue.serverTimestamp();
}

export function nowTimestamp(): Timestamp {
  return Timestamp.now();
}

export function timestampFromDate(
  value: Date,
): Timestamp {
  return Timestamp.fromDate(value);
}

export function timestampAfterMinutes(
  minutes: number,
): Timestamp {
  const date = new Date(
    Date.now() + minutes * 60 * 1000,
  );

  return Timestamp.fromDate(date);
}

export function timestampAfterHours(
  hours: number,
): Timestamp {
  const date = new Date(
    Date.now() + hours * 60 * 60 * 1000,
  );

  return Timestamp.fromDate(date);
}

export function timestampAfterDays(
  days: number,
): Timestamp {
  const date = new Date(
    Date.now() + days * 24 * 60 * 60 * 1000,
  );

  return Timestamp.fromDate(date);
}