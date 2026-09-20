import "server-only";

import {
  FIRESTORE_COLLECTIONS,
  isServiceCategoryCode,
  type ServiceCategoryStatus,
} from "@feasta/shared-types";

import {adminDb} from "@/lib/firebase/admin";
import type {
  ServiceCategoryOption,
} from "./service-category-types";

export type {
  ServiceCategoryOption,
} from "./service-category-types";

function isServiceType(
  value: unknown,
): value is ServiceCategoryOption["serviceType"] {
  return value === "catering" ||
    value === "addon";
}

function isStatus(
  value: unknown,
): value is ServiceCategoryStatus {
  return value === "active" ||
    value === "discontinued";
}

export async function getServiceCategoryOptions(): Promise<
  ServiceCategoryOption[]
> {
  const snapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.serviceCategories)
    .get();

  return snapshot.docs
    .map((document) => {
      const data = document.data();

      if (
        !isServiceCategoryCode(document.id) ||
        typeof data.name !== "string" ||
        !isServiceType(data.serviceType) ||
        !isStatus(data.status)
      ) {
        return null;
      }

      const name = data.name.trim();

      if (!name) {
        return null;
      }

      return {
        code: document.id,
        name,
        serviceType: data.serviceType,
        status: data.status,
      } satisfies ServiceCategoryOption;
    })
    .filter(
      (category): category is ServiceCategoryOption =>
        category !== null,
    )
    .sort((left, right) =>
      left.name.localeCompare(
        right.name,
        undefined,
        {sensitivity: "base"},
      ),
    );
}

export async function getActiveServiceCategoryOptions(): Promise<
  ServiceCategoryOption[]
> {
  const categories =
    await getServiceCategoryOptions();

  return categories.filter(
    (category) =>
      category.status === "active",
  );
}
