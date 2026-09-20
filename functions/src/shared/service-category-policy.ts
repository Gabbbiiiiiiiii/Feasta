import {HttpsError} from "firebase-functions/v2/https";

import {
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
  status: "active" | "discontinued";
};


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

  return {
    code,
    name: name.trim(),
    serviceType,
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
