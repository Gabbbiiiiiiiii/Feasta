import {
  DEFAULT_SERVICE_CATEGORY_DEFINITIONS,
} from "@feasta/shared-types";

import type {
  ServiceCategoryOption,
} from "@/lib/service-categories/service-category-types";

export const TEST_SERVICE_CATEGORY_OPTIONS =
  DEFAULT_SERVICE_CATEGORY_DEFINITIONS
    .map(
      (category) =>
        ({
          code: category.code,
          name: category.name,
          serviceType: category.serviceType,
          status: "active",
        }) satisfies ServiceCategoryOption,
    )
    .sort((left, right) =>
      left.name.localeCompare(
        right.name,
        undefined,
        {sensitivity: "base"},
      ),
    );
