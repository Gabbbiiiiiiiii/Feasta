import "server-only";

import {
  FIRESTORE_COLLECTIONS,
} from "@feasta/shared-types";

import type {
  AdminServiceCategory,
  AdminServiceCategoryCapacityCapabilities,
  AdminServiceCategoryServiceType,
  AdminServiceCategoryStatus,
} from "@/lib/admin/file-maintenance/admin-service-category-types";
import {requireAdmin} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

function isServiceType(
  value: unknown,
): value is AdminServiceCategoryServiceType {
  return value === "catering" ||
    value === "addon";
}

function isStatus(
  value: unknown,
): value is AdminServiceCategoryStatus {
  return value === "active" ||
    value === "discontinued";
}

function parseCapacityCapabilities(
  value: unknown,
): AdminServiceCategoryCapacityCapabilities | undefined {
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

export async function getAdminServiceCategories(): Promise<
  AdminServiceCategory[]
> {
  await requireAdmin();

  const snapshot = await adminDb
    .collection(FIRESTORE_COLLECTIONS.serviceCategories)
    .get();

  return snapshot.docs
    .map((document) => {
      const data = document.data();

      if (
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
        sortName:
          typeof data.sortName === "string" &&
          data.sortName.trim()
            ? data.sortName.trim()
            : name.toLowerCase(),
      } satisfies AdminServiceCategory;
    })
    .filter(
      (category): category is AdminServiceCategory =>
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
