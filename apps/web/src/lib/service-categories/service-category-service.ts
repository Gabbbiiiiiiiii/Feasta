import "server-only";

import {
  FIRESTORE_COLLECTIONS,
  isServiceCategoryCode,
  type ServiceCategoryCapacityCapabilities,
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

function parseCapacityCapabilities(
  value: unknown,
): ServiceCategoryCapacityCapabilities | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.requiresGuestCapacity !== "boolean" ||
    typeof record.usesStaffCapacity !== "boolean" ||
    typeof record.usesEquipmentCapacity !== "boolean"
  ) {
    return undefined;
  }

  return {
    requiresGuestCapacity: record.requiresGuestCapacity,
    usesStaffCapacity: record.usesStaffCapacity,
    usesEquipmentCapacity: record.usesEquipmentCapacity,
  };
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
        ...(parseCapacityCapabilities(
          data.capacityCapabilities,
        )
          ? {
              capacityCapabilities:
                parseCapacityCapabilities(
                  data.capacityCapabilities,
                ),
            }
          : {}),
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
