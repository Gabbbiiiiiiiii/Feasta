import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  writeAuditLogInTransaction,
} from "../shared/audit.js";
import {
  requireAuth,
} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {
  USER_ROLES,
  type ProviderServiceType,
} from "../shared/constants.js";
import {
  db,
} from "../shared/firestore.js";
import {
  appCheckCallableOptions,
} from "../shared/function-options.js";
import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";
import {
  isServiceCategoryCode,
} from "../shared/service-category-policy.js";
import {
  serverTimestamp,
} from "../shared/timestamps.js";
import {
  requireObject,
  requireString,
} from "../shared/validation.js";

const COLLECTION = "serviceCategories";

type CategoryServiceType =
  Exclude<ProviderServiceType, "both">;

type CategoryStatus =
  "active" | "discontinued";

type CategoryCapacityCapabilities = {
  requiresGuestCapacity: boolean;
  usesStaffCapacity: boolean;
  usesEquipmentCapacity: boolean;
};

type CategoryData = {
  code: string;
  name: string;
  serviceType: CategoryServiceType;
  capacityCapabilities?: CategoryCapacityCapabilities;
  status: CategoryStatus;
  sortName: string;
};

function requireCategoryCode(
  value: unknown,
): string {
  const code = requireString(
    value,
    "code",
    {
      minLength: 2,
      maxLength: 100,
    },
  );

  if (!isServiceCategoryCode(code)) {
    throw new HttpsError(
      "invalid-argument",
      "code must contain only lowercase letters, numbers, and underscores.",
    );
  }

  return code;
}

function requireCategoryName(
  value: unknown,
): string {
  return requireString(
    value,
    "name",
    {
      minLength: 2,
      maxLength: 100,
    },
  ).trim();
}

function requireCategoryServiceType(
  value: unknown,
): CategoryServiceType {
  if (
    value !== "catering" &&
    value !== "addon"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "serviceType must be catering or addon.",
    );
  }

  return value;
}

function requireCapacityCapabilities(
  value: unknown,
): CategoryCapacityCapabilities {
  const capabilities = requireObject(value);

  if (
    typeof capabilities.requiresGuestCapacity !== "boolean" ||
    typeof capabilities.usesStaffCapacity !== "boolean" ||
    typeof capabilities.usesEquipmentCapacity !== "boolean"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "capacityCapabilities must contain boolean guest, staff, and equipment requirements.",
    );
  }

  return {
    requiresGuestCapacity:
      capabilities.requiresGuestCapacity,
    usesStaffCapacity:
      capabilities.usesStaffCapacity,
    usesEquipmentCapacity:
      capabilities.usesEquipmentCapacity,
  };
}

function parseStoredCapacityCapabilities(
  value: unknown,
): CategoryCapacityCapabilities | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return undefined;
  }

  const capabilities =
    value as Record<string, unknown>;

  if (
    typeof capabilities.requiresGuestCapacity !== "boolean" ||
    typeof capabilities.usesStaffCapacity !== "boolean" ||
    typeof capabilities.usesEquipmentCapacity !== "boolean"
  ) {
    return undefined;
  }

  return {
    requiresGuestCapacity:
      capabilities.requiresGuestCapacity,
    usesStaffCapacity:
      capabilities.usesStaffCapacity,
    usesEquipmentCapacity:
      capabilities.usesEquipmentCapacity,
  };
}

function parseCategory(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined,
): CategoryData {
  if (
    !data ||
    data.code !== id ||
    typeof data.name !== "string" ||
    (
      data.serviceType !== "catering" &&
      data.serviceType !== "addon"
    ) ||
    (
      data.status !== "active" &&
      data.status !== "discontinued"
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The service category record is invalid.",
    );
  }

  return {
    code: id,
    name: data.name,
    serviceType: data.serviceType,
    ...(parseStoredCapacityCapabilities(
      data.capacityCapabilities,
    )
      ? {
          capacityCapabilities:
            parseStoredCapacityCapabilities(
              data.capacityCapabilities,
            ),
        }
      : {}),
    status: data.status,
    sortName:
      typeof data.sortName === "string"
        ? data.sortName
        : data.name.trim().toLowerCase(),
  };
}

function categoryAuditData(
  category: CategoryData,
): Record<string, unknown> {
  return {
    code: category.code,
    name: category.name,
    serviceType: category.serviceType,
    ...(category.capacityCapabilities
      ? {
          capacityCapabilities:
            category.capacityCapabilities,
        }
      : {}),
    status: category.status,
    sortName: category.sortName,
  };
}

async function authorizeAdmin(
  request: Parameters<typeof requireAuth>[0],
  scope: string,
): Promise<ReturnType<typeof requireAuth>> {
  const actor = requireAuth(request);

  await enforceCallableRateLimit(
    request,
    {
      scope,
      limit: 60,
      windowSeconds: 60 * 60,
    },
  );

  await requireRole(
    actor.uid,
    [USER_ROLES.admin],
  );

  return actor;
}

async function categoryUsageCounts(
  code: string,
): Promise<{
  primaryProviders: number;
  providers: number;
  services: number;
}> {
  const providers = db.collection("providers");
  const services = db.collection("addons");

  const [
    primaryProviderCount,
    providerCount,
    serviceCount,
  ] = await Promise.all([
    providers
      .where("providerCategory", "==", code)
      .count()
      .get(),
    providers
      .where("serviceCategories", "array-contains", code)
      .count()
      .get(),
    services
      .where("category", "==", code)
      .count()
      .get(),
  ]);

  return {
    primaryProviders:
      primaryProviderCount.data().count,
    providers:
      providerCount.data().count,
    services:
      serviceCount.data().count,
  };
}

export const createServiceCategory = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(
      request,
      "createServiceCategory",
    );

    const input = requireObject(request.data);
    const code = requireCategoryCode(input.code);
    const name = requireCategoryName(input.name);
    const serviceType =
      requireCategoryServiceType(input.serviceType);
    const capacityCapabilities =
      requireCapacityCapabilities(
        input.capacityCapabilities,
      );

    const reference =
      db.collection(COLLECTION).doc(code);

    const category: CategoryData = {
      code,
      name,
      serviceType,
      capacityCapabilities,
      status: "active",
      sortName: name.toLowerCase(),
    };

    await db.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(reference);

        if (snapshot.exists) {
          throw new HttpsError(
            "already-exists",
            "A service category with this code already exists.",
          );
        }

        transaction.create(
          reference,
          {
            ...category,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: actor.uid,
            updatedBy: actor.uid,
          },
        );

        writeAuditLogInTransaction(
          transaction,
          {
            actorId: actor.uid,
            actorRole: USER_ROLES.admin,
            action: "service_category_created",
            targetCollection: COLLECTION,
            targetId: code,
            before: null,
            after: categoryAuditData(category),
          },
        );
      },
    );

    return {
      success: true,
      category,
    };
  },
);

export const updateServiceCategory = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(
      request,
      "updateServiceCategory",
    );

    const input = requireObject(request.data);
    const code = requireCategoryCode(input.code);
    const name = requireCategoryName(input.name);

    const requestedServiceType =
      input.serviceType === undefined
        ? null
        : requireCategoryServiceType(
            input.serviceType,
          );
    const capacityCapabilities =
      requireCapacityCapabilities(
        input.capacityCapabilities,
      );

    const reference =
      db.collection(COLLECTION).doc(code);

    const usage =
      requestedServiceType === null
        ? null
        : await categoryUsageCounts(code);

    await db.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(reference);

        if (!snapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The service category was not found.",
          );
        }

        const before =
          parseCategory(
            snapshot.id,
            snapshot.data(),
          );

        let serviceType =
          before.serviceType;

        if (
          requestedServiceType !== null &&
          requestedServiceType !==
            before.serviceType
        ) {
          if (before.status !== "discontinued") {
            throw new HttpsError(
              "failed-precondition",
              "Discontinue the service category before changing its service type.",
            );
          }

          if (
            !usage ||
            usage.primaryProviders > 0 ||
            usage.providers > 0 ||
            usage.services > 0
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The service type cannot be changed while this category is in use.",
            );
          }

          serviceType =
            requestedServiceType;
        }

        const after: CategoryData = {
          ...before,
          name,
          serviceType,
          capacityCapabilities,
          sortName: name.toLowerCase(),
        };

        transaction.update(
          reference,
          {
            name: after.name,
            serviceType: after.serviceType,
            capacityCapabilities:
              after.capacityCapabilities,
            sortName: after.sortName,
            updatedAt: serverTimestamp(),
            updatedBy: actor.uid,
          },
        );

        writeAuditLogInTransaction(
          transaction,
          {
            actorId: actor.uid,
            actorRole: USER_ROLES.admin,
            action: "service_category_updated",
            targetCollection: COLLECTION,
            targetId: code,
            before: categoryAuditData(before),
            after: categoryAuditData(after),
          },
        );
      },
    );

    return {
      success: true,
    };
  },
);

async function changeCategoryStatus(
  request: Parameters<typeof requireAuth>[0],
  nextStatus: CategoryStatus,
): Promise<{
  success: true;
}> {
  const scope =
    nextStatus === "active"
      ? "reactivateServiceCategory"
      : "discontinueServiceCategory";

  const actor =
    await authorizeAdmin(
      request,
      scope,
    );

  const input = requireObject(request.data);
  const code = requireCategoryCode(input.code);

  const reference =
    db.collection(COLLECTION).doc(code);

  await db.runTransaction(
    async (transaction) => {
      const snapshot =
        await transaction.get(reference);

      if (!snapshot.exists) {
        throw new HttpsError(
          "not-found",
          "The service category was not found.",
        );
      }

      const before =
        parseCategory(
          snapshot.id,
          snapshot.data(),
        );

      if (before.status === nextStatus) {
        return;
      }

      const after: CategoryData = {
        ...before,
        status: nextStatus,
      };

      transaction.update(
        reference,
        {
          status: nextStatus,
          updatedAt: serverTimestamp(),
          updatedBy: actor.uid,
        },
      );

      writeAuditLogInTransaction(
        transaction,
        {
          actorId: actor.uid,
          actorRole: USER_ROLES.admin,
          action:
            nextStatus === "active"
              ? "service_category_reactivated"
              : "service_category_discontinued",
          targetCollection: COLLECTION,
          targetId: code,
          before: categoryAuditData(before),
          after: categoryAuditData(after),
        },
      );
    },
  );

  return {
    success: true,
  };
}

export const discontinueServiceCategory =
  onCall(
    appCheckCallableOptions,
    async (request) =>
      changeCategoryStatus(
        request,
        "discontinued",
      ),
  );

export const reactivateServiceCategory =
  onCall(
    appCheckCallableOptions,
    async (request) =>
      changeCategoryStatus(
        request,
        "active",
      ),
  );

export const deleteServiceCategory = onCall(
  appCheckCallableOptions,
  async (request) => {
    const actor = await authorizeAdmin(
      request,
      "deleteServiceCategory",
    );

    const input = requireObject(request.data);
    const code = requireCategoryCode(input.code);

    const reference =
      db.collection(COLLECTION).doc(code);

    const snapshot = await reference.get();

    if (!snapshot.exists) {
      throw new HttpsError(
        "not-found",
        "The service category was not found.",
      );
    }

    const category =
      parseCategory(
        snapshot.id,
        snapshot.data(),
      );

    if (category.status !== "discontinued") {
      throw new HttpsError(
        "failed-precondition",
        "Discontinue the service category before deleting it.",
      );
    }

    const usage =
      await categoryUsageCounts(code);

    if (
      usage.primaryProviders > 0 ||
      usage.providers > 0 ||
      usage.services > 0
    ) {
      throw new HttpsError(
        "failed-precondition",
        "This service category is currently in use and cannot be deleted.",
      );
    }

    await db.runTransaction(
      async (transaction) => {
        const currentSnapshot =
          await transaction.get(reference);

        if (!currentSnapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The service category was not found.",
          );
        }

        const current =
          parseCategory(
            currentSnapshot.id,
            currentSnapshot.data(),
          );

        if (
          current.status !== "discontinued"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "The service category is no longer discontinued.",
          );
        }

        transaction.delete(reference);

        writeAuditLogInTransaction(
          transaction,
          {
            actorId: actor.uid,
            actorRole: USER_ROLES.admin,
            action: "service_category_deleted",
            targetCollection: COLLECTION,
            targetId: code,
            before: categoryAuditData(current),
            after: null,
            metadata: {
              usage,
            },
          },
        );
      },
    );

    return {
      success: true,
    };
  },
);
