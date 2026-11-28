import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

describe("provider walk-in records contract", () => {
  const root = process.cwd();
  const records = readFileSync(
    join(root, "src/app/provider/bookings/walk-in/walk-in-booking-records.tsx"),
    "utf8",
  );
  const indexes = JSON.parse(
    readFileSync(join(root, "../../firebase/firestore.indexes.json"), "utf8"),
  ).indexes as {collectionGroup: string; fields: {fieldPath: string; order?: string}[]}[];

  it("loads the walk-in list with automatic createdAt ordering", () => {
    expect(records).toContain('orderBy("createdAt", "desc")');
    expect(records).not.toContain("FieldPath.documentId()");
    expect(records).toContain("Walk-in summary count failed");
  });

  it("keeps summary counts from blocking the records list", () => {
    expect(records).toContain("countOf(() => records.count().get())");
    expect(records).toContain(
      'countOf(() => records.where("status", "==", "confirmed").where("eventDateKey", ">=", today).count().get())',
    );
    expect(records).toContain('countOf(() => records.where("status", "==", "completed").count().get())');
  });

  it("declares the walk-in summary composite index", () => {
    const paths = indexes
      .filter((index) => index.collectionGroup === "walkInBookings")
      .map((index) => index.fields.map((field) => `${field.fieldPath}:${field.order ?? ""}`).join(","));
    expect(paths).toContain("status:ASCENDING,eventDateKey:ASCENDING");
    expect(paths).not.toContain("createdAt:DESCENDING,__name__:DESCENDING");
  });
});
