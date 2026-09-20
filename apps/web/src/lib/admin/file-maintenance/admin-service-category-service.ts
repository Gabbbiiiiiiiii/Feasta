import "server-only";

import {
  FIRESTORE_COLLECTIONS,
} from "@feasta/shared-types";

import type {
  AdminServiceCategory,
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
