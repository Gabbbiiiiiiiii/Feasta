import "server-only";

import {adminDb} from "@/lib/firebase/admin";

export type ActiveOccasionOption = {
  id: string;
  label: string;
};

type OrderedOccasionOption = ActiveOccasionOption & {
  sortOrder: number;
};

const occasionIdPattern = /^[a-z][a-z0-9_]{1,63}$/u;

/**
 * Public, server-verified occasion options.
 *
 * Returns an empty list when the current catalog cannot be verified.
 * Never falls back to legacy event-type selections.
 */
export async function getActiveOccasionOptions(): Promise<
  ActiveOccasionOption[]
> {
  try {
    const catalogRef = adminDb.doc("occasionCatalog/current");

    const [catalogSnapshot, occasionSnapshot] = await Promise.all([
      catalogRef.get(),
      adminDb.collection("occasions")
        .where("active", "==", true)
        .limit(201)
        .get(),
    ]);

    const catalog = catalogSnapshot.data();

    if (
      catalog?.activationState !== "stable" ||
      !Number.isSafeInteger(catalog.revision) ||
      catalog.revision < 1 ||
      occasionSnapshot.size > 200 ||
      occasionSnapshot.docs.length !== occasionSnapshot.size
    ) {
      return [];
    }

    const occasions: OrderedOccasionOption[] = [];
    const seen = new Set<string>();

    for (const document of occasionSnapshot.docs) {
      const data = document.data();

      if (
        seen.has(document.id) ||
        data.id !== document.id ||
        data.active !== true ||
        data.moderationState !== "approved" ||
        typeof data.label !== "string" ||
        !data.label.trim() ||
        !Number.isSafeInteger(data.sortOrder) ||
        data.sortOrder < 0 ||
        !occasionIdPattern.test(document.id)
      ) {
        return [];
      }

      seen.add(document.id);

      occasions.push({
        id: document.id,
        label: data.label.trim(),
        sortOrder: data.sortOrder,
      });
    }

    const latest = (await catalogRef.get()).data();

    if (
      latest?.activationState !== "stable" ||
      latest.revision !== catalog.revision
    ) {
      return [];
    }

    return occasions
      .sort((a, b) =>
        a.sortOrder - b.sortOrder || a.id.localeCompare(b.id),
      )
      .map(({id, label}) => ({id, label}));
  } catch {
    return [];
  }
}