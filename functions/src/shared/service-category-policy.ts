import {HttpsError} from "firebase-functions/v2/https";

import {
  providerCapacityCapabilities,
  type ProviderCapacityCapabilities,
  type ProviderServiceType,
} from "./constants.js";
import {db} from "./firestore.js";

const SERVICE_CATEGORIES_COLLECTION = "serviceCategories";

import {
  isServiceCategoryCode,
  type ServiceCategoryCode,
} from "./service-category-code.js";

export {
  isServiceCategoryCode,
  type ServiceCategoryCode,
} from "./service-category-code.js";

type MasterServiceCategory = {
  code: ServiceCategoryCode;
  name: string;
  serviceType: Exclude<ProviderServiceType, "both">;
  capacityCapabilities?: ProviderCapacityCapabilities;
  status: "active" | "discontinued";
};


function parseCapacityCapabilities(
  value: unknown,
): ProviderCapacityCapabilities | undefined {
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

function parseMasterServiceCategory(
  id: string,
  data: FirebaseFirestore.DocumentData | undefined,
): MasterServiceCategory | null {
  if (!data) return null;

  const code = data.code;
  const name = data.name;
  const serviceType = data.serviceType;
  const status = data.status;

  if (
    !isServiceCategoryCode(code) ||
    code !== id ||
    typeof name !== "string" ||
    name.trim().length === 0 ||
    (serviceType !== "catering" && serviceType !== "addon") ||
    (status !== "active" && status !== "discontinued")
  ) {
    return null;
  }

  const capacityCapabilities =
    parseCapacityCapabilities(
      data.capacityCapabilities,
    );

  return {
    code,
    name: name.trim(),
    serviceType,
    ...(capacityCapabilities
      ? {capacityCapabilities}
      : {}),
    status,
  };
}

function categoryMatchesProviderType(
  categoryType: MasterServiceCategory["serviceType"],
  providerServiceType: ProviderServiceType,
): boolean {
  return providerServiceType === "both" ||
    providerServiceType === categoryType;
}

function resolvedCategoryCapacityCapabilities(
  category: MasterServiceCategory,
): ProviderCapacityCapabilities {
  return category.capacityCapabilities ??
    providerCapacityCapabilities([
      category.code,
    ]);
}

function unionCapacityCapabilities(
  categories: readonly MasterServiceCategory[],
): ProviderCapacityCapabilities {
  return categories.reduce<ProviderCapacityCapabilities>(
    (combined, category) => {
      const current =
        resolvedCategoryCapacityCapabilities(
          category,
        );

      return {
        requiresGuestCapacity:
          combined.requiresGuestCapacity ||
          current.requiresGuestCapacity,
        usesStaffCapacity:
          combined.usesStaffCapacity ||
          current.usesStaffCapacity,
        usesEquipmentCapacity:
          combined.usesEquipmentCapacity ||
          current.usesEquipmentCapacity,
      };
    },
    {
      requiresGuestCapacity: false,
      usesStaffCapacity: false,
      usesEquipmentCapacity: false,
    },
  );
}

export async function requireActiveServiceCategories(
  values: unknown,
  providerServiceType: ProviderServiceType,
  options: {
    required?: boolean;
    field?: string;
  } = {},
): Promise<ServiceCategoryCode[]> {
  const field = options.field ?? "serviceCategories";

  if (!Array.isArray(values)) {
    if (!options.required && values === undefined) {
      return [];
    }

    throw new HttpsError(
      "invalid-argument",
      `${field} must be a list.`,
    );
  }

  if (values.length > 50) {
    throw new HttpsError(
      "invalid-argument",
      `${field} contains too many values.`,
    );
  }

  const categories = [
    ...new Set(
      values.map((value) => {
        if (!isServiceCategoryCode(value)) {
          throw new HttpsError(
            "invalid-argument",
            `${field} contains an invalid service category.`,
          );
        }

        return value;
      }),
    ),
  ];

  if (options.required && categories.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must contain at least one service category.`,
    );
  }

  if (categories.length === 0) {
    return [];
  }

  const references = categories.map((code) =>
    db.collection(SERVICE_CATEGORIES_COLLECTION).doc(code)
  );

  const snapshots = await db.getAll(...references);

  for (let index = 0; index < categories.length; index++) {
    const code = categories[index];
    const snapshot = snapshots[index];

    if (!snapshot) {
      throw new HttpsError(
        "internal",
        "The service category lookup returned an incomplete result.",
      );
    }

    const category = snapshot.exists
      ? parseMasterServiceCategory(
          snapshot.id,
          snapshot.data(),
        )
      : null;

    if (!category) {
      throw new HttpsError(
        "invalid-argument",
        `The service category "${code}" is not recognized.`,
      );
    }

    if (category.status !== "active") {
      throw new HttpsError(
        "failed-precondition",
        `The service category "${category.name}" is no longer available for selection.`,
      );
    }

    if (
      !categoryMatchesProviderType(
        category.serviceType,
        providerServiceType,
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        `The service category "${category.name}" does not match ` +
          "the selected provider service type.",
      );
    }
  }

  return categories;
}

export async function requireActiveServiceCategoriesInTransaction(
  transaction: FirebaseFirestore.Transaction,
  values: readonly ServiceCategoryCode[],
  providerServiceType: ProviderServiceType,
  field = "serviceCategories",
): Promise<ServiceCategoryCode[]> {
  if (values.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must contain at least one service category.`,
    );
  }

  if (values.length > 50) {
    throw new HttpsError(
      "invalid-argument",
      `${field} contains too many values.`,
    );
  }

  const categories = [
    ...new Set(
      values.map((value) => {
        if (!isServiceCategoryCode(value)) {
          throw new HttpsError(
            "invalid-argument",
            `${field} contains an invalid service category.`,
          );
        }

        return value;
      }),
    ),
  ];

  const references = categories.map((code) =>
    db.collection(SERVICE_CATEGORIES_COLLECTION).doc(code)
  );

  const snapshots = await transaction.getAll(
    ...references,
  );

  for (let index = 0; index < categories.length; index++) {
    const code = categories[index];
    const snapshot = snapshots[index];

    if (!snapshot) {
      throw new HttpsError(
        "internal",
        "The service category lookup returned an incomplete result.",
      );
    }

    const category = snapshot.exists
      ? parseMasterServiceCategory(
          snapshot.id,
          snapshot.data(),
        )
      : null;

    if (!category) {
      throw new HttpsError(
        "invalid-argument",
        `The service category "${code}" is not recognized.`,
      );
    }

    if (category.status !== "active") {
      throw new HttpsError(
        "failed-precondition",
        `The service category "${category.name}" is no longer available for selection.`,
      );
    }

    if (
      !categoryMatchesProviderType(
        category.serviceType,
        providerServiceType,
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        `The service category "${category.name}" does not match ` +
          "the selected provider service type.",
      );
    }
  }

  return categories;
}

export async function resolveServiceCategoryCapacityCapabilities(
  values: unknown,
  providerServiceType: ProviderServiceType,
  options: {
    required?: boolean;
    field?: string;
  } = {},
): Promise<ProviderCapacityCapabilities> {
  const categories =
    await requireActiveServiceCategories(
      values,
      providerServiceType,
      options,
    );

  if (categories.length === 0) {
    return {
      requiresGuestCapacity: false,
      usesStaffCapacity: false,
      usesEquipmentCapacity: false,
    };
  }

  const references = categories.map((code) =>
    db.collection(
      SERVICE_CATEGORIES_COLLECTION,
    ).doc(code)
  );

  const snapshots = await db.getAll(
    ...references,
  );

  const resolved = snapshots.map(
    (snapshot, index) => {
      const code = categories[index];

      if (!code) {
        throw new HttpsError(
          "internal",
          "The service category lookup returned an incomplete result.",
        );
      }

      const category = snapshot.exists
        ? parseMasterServiceCategory(
            snapshot.id,
            snapshot.data(),
          )
        : null;

      if (!category) {
        throw new HttpsError(
          "internal",
          `The validated service category "${code}" could not be resolved.`,
        );
      }

      return category;
    },
  );

  return unionCapacityCapabilities(
    resolved,
  );
}

export async function resolveServiceCategoryCapacityCapabilitiesInTransaction(
  transaction: FirebaseFirestore.Transaction,
  values: readonly ServiceCategoryCode[],
  providerServiceType: ProviderServiceType,
  field = "serviceCategories",
): Promise<ProviderCapacityCapabilities> {
  const categories =
    await requireActiveServiceCategoriesInTransaction(
      transaction,
      values,
      providerServiceType,
      field,
    );

  const references = categories.map((code) =>
    db.collection(
      SERVICE_CATEGORIES_COLLECTION,
    ).doc(code)
  );

  const snapshots = await transaction.getAll(
    ...references,
  );

  const resolved = snapshots.map(
    (snapshot, index) => {
      const code = categories[index];

      if (!code) {
        throw new HttpsError(
          "internal",
          "The service category lookup returned an incomplete result.",
        );
      }

      const category = snapshot.exists
        ? parseMasterServiceCategory(
            snapshot.id,
            snapshot.data(),
          )
        : null;

      if (!category) {
        throw new HttpsError(
          "internal",
          `The validated service category "${code}" could not be resolved.`,
        );
      }

      return category;
    },
  );

  return unionCapacityCapabilities(
    resolved,
  );
}

export async function requireActiveServiceCategoryInTransaction(
  transaction: FirebaseFirestore.Transaction,
  value: unknown,
  providerServiceType: ProviderServiceType,
  field = "category",
): Promise<ServiceCategoryCode> {
  if (!isServiceCategoryCode(value)) {
    throw new HttpsError(
      "invalid-argument",
      `${field} contains an invalid service category.`,
    );
  }

  const reference = db
    .collection(SERVICE_CATEGORIES_COLLECTION)
    .doc(value);

  const snapshot = await transaction.get(reference);

  const category = snapshot.exists
    ? parseMasterServiceCategory(
        snapshot.id,
        snapshot.data(),
      )
    : null;

  if (!category) {
    throw new HttpsError(
      "invalid-argument",
      `The service category "${value}" is not recognized.`,
    );
  }

  if (category.status !== "active") {
    throw new HttpsError(
      "failed-precondition",
      `The service category "${category.name}" is no longer available for selection.`,
    );
  }

  if (
    !categoryMatchesProviderType(
      category.serviceType,
      providerServiceType,
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      `The service category "${category.name}" does not match ` +
        "the selected provider service type.",
    );
  }

  return category.code;
}

export async function requireActiveServiceCategory(
  value: unknown,
  providerServiceType: ProviderServiceType,
  field = "category",
): Promise<ServiceCategoryCode> {
  const categories = await requireActiveServiceCategories(
    [value],
    providerServiceType,
    {
      required: true,
      field,
    },
  );

  const category = categories[0];

  if (!category) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must contain a service category.`,
    );
  }

  return category;
}
