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
  cloudinarySecrets,
  verifyProviderServiceImage,
} from "../shared/cloudinary.js";
import {
  isApprovedProviderForOperations,
  PROVIDER_SERVICE_CATEGORIES,
  USER_ROLES,
  serviceCategoryMatchesProviderType,
  type ProviderServiceCategory,
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
  serverTimestamp,
} from "../shared/timestamps.js";

const COLLECTIONS = {
  providers: "providers",
  addons: "addons",
} as const;

const ADDON_PRICING_TYPES = [
  "fixed",
  "per_guest",
  "per_hour",
  "per_unit",
  "custom_quote",
] as const;

type AddonPricingType =
  (typeof ADDON_PRICING_TYPES)[number];

type ServiceInput = {
  name: string;
  description: string;
  category: ProviderServiceCategory;
  pricingType: AddonPricingType;
  price: number | null;
  imageUrl: string | null;
  imagePublicId: string | null;
};

type OwnedProvider = {
  id: string;
  ownerId: string;
  data: Record<string, unknown>;
  providerServiceType: ProviderServiceType;
  serviceCategories: readonly ProviderServiceCategory[];
};

const CREATE_FIELDS = [
  "serviceId",
  "name",
  "description",
  "category",
  "pricingType",
  "price",
  "imageUrl",
  "imagePublicId",
] as const;

const UPDATE_FIELDS = [
  ...CREATE_FIELDS,
] as const;

const SERVICE_ID_FIELDS = [
  "serviceId",
] as const;

/* ========================================================================== */
/* CREATE                                                                     */
/* ========================================================================== */

export const createProviderService = onCall(
  {
    ...appCheckCallableOptions,
    secrets: cloudinarySecrets,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor =
      requireAuth(request);

    await requireRole(
      actor.uid,
      [USER_ROLES.provider],
    );

    await enforceCallableRateLimit(
      request,
      {
        scope:
          "services.createProviderService",
        limit: 20,
        windowSeconds: 60 * 60,
      },
    );

    const rawInput =
      requireObject(request.data);

    rejectUnknownFields(
      rawInput,
      CREATE_FIELDS,
    );

    const serviceId =
    requireDocumentId(
      rawInput.serviceId,
      "serviceId",
    );

    const provider =
      await requireOwnedServiceProvider(
        actor.uid,
      );

    const input =
      parseServiceInput(rawInput);

    assertServiceCategoryAllowed(
      provider,
      input.category,
    );

    await verifyProviderServiceImage({
    ownerId:
      actor.uid,

    serviceId,

    url:
      input.imageUrl,

    publicId:
      input.imagePublicId,

    maximumBytes:
      5 * 1024 * 1024,
  });

    const reference =
      db
        .collection(COLLECTIONS.addons)
        .doc(serviceId);

    await db.runTransaction(
      async (transaction) => {
        const serviceData = {
          providerId:
            provider.id,

          ownerId:
            actor.uid,

          name:
            input.name,

          description:
            input.description,

          category:
            input.category,

          pricingType:
            input.pricingType,

          price:
            input.price,

          imageUrl:
            input.imageUrl,

          imagePublicId:
            input.imagePublicId,

          status:
            "draft",

          isActive:
            false,

          isAvailable:
            false,

          isPublished:
            false,

          isDeleted:
            false,

          createdAt:
            serverTimestamp(),

          updatedAt:
            serverTimestamp(),
        };

        transaction.create(
          reference,
          serviceData,
        );

        writeAuditLogInTransaction(
          transaction,
          {
            actorId:
              actor.uid,

            actorRole:
              USER_ROLES.provider,

            action:
              "provider_service.created",

            targetCollection:
              COLLECTIONS.addons,

            targetId:
              reference.id,

            source:
              "cloud_function",

            before:
              null,

            after: {
              status:
                "draft",

              category:
                input.category,

              pricingType:
                input.pricingType,

              price:
                input.price,
            },

            metadata: {
              providerId:
                provider.id,
            },
          },
        );
      },
    );

    return {
      success: true,
      serviceId: reference.id,
      status: "draft",
    };
  },
);

/* ========================================================================== */
/* UPDATE                                                                     */
/* ========================================================================== */

export const updateProviderService = onCall(
  {
    ...appCheckCallableOptions,
    secrets: cloudinarySecrets,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor =
      requireAuth(request);

    await requireRole(
      actor.uid,
      [USER_ROLES.provider],
    );

    await enforceCallableRateLimit(
      request,
      {
        scope:
          "services.updateProviderService",
        limit: 60,
        windowSeconds: 60 * 60,
      },
    );

    const rawInput =
      requireObject(request.data);

    rejectUnknownFields(
      rawInput,
      UPDATE_FIELDS,
    );

    const serviceId =
      requireDocumentId(
        rawInput.serviceId,
        "serviceId",
      );

    const provider =
      await requireOwnedServiceProvider(
        actor.uid,
      );

    const input =
      parseServiceInput(rawInput);

    assertServiceCategoryAllowed(
      provider,
      input.category,
    );

    await verifyProviderServiceImage({
  ownerId:
    actor.uid,

  serviceId,

  url:
    input.imageUrl,

  publicId:
    input.imagePublicId,

  maximumBytes:
    5 * 1024 * 1024,
});

    const reference =
      db
        .collection(COLLECTIONS.addons)
        .doc(serviceId);

    await db.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(
            reference,
          );

        if (!snapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The event service does not exist.",
          );
        }

        const current =
          snapshot.data() ?? {};

        assertOwnedService(
          current,
          provider.id,
          actor.uid,
        );

        if (
          current.isDeleted === true
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Deleted event services cannot be modified.",
          );
        }

        if (
          current.status !== "draft"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Only draft event services can be edited.",
          );
        }

        transaction.update(
          reference,
          {
            name:
              input.name,

            description:
              input.description,

            category:
              input.category,

            pricingType:
              input.pricingType,

            price:
              input.price,

            imageUrl:
              input.imageUrl,

            imagePublicId:
              input.imagePublicId,

            updatedAt:
              serverTimestamp(),
          },
        );

        writeAuditLogInTransaction(
          transaction,
          {
            actorId:
              actor.uid,

            actorRole:
              USER_ROLES.provider,

            action:
              "provider_service.updated",

            targetCollection:
              COLLECTIONS.addons,

            targetId:
              serviceId,

            source:
              "cloud_function",

            before: {
              name:
                current.name ?? null,

              category:
                current.category ?? null,

              pricingType:
                current.pricingType ?? null,

              price:
                current.price ?? null,
            },

            after: {
              name:
                input.name,

              category:
                input.category,

              pricingType:
                input.pricingType,

              price:
                input.price,
            },

            metadata: {
              providerId:
                provider.id,
            },
          },
        );
      },
    );

    return {
      success: true,
      serviceId,
      status: "draft",
    };
  },
);

/* ========================================================================== */
/* PUBLISH                                                                    */
/* ========================================================================== */

export const publishProviderService = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor =
      requireAuth(request);

    await requireRole(
      actor.uid,
      [USER_ROLES.provider],
    );

    await enforceCallableRateLimit(
      request,
      {
        scope:
          "services.publishProviderService",
        limit: 30,
        windowSeconds: 60 * 60,
      },
    );

    const rawInput =
      requireObject(request.data);

    rejectUnknownFields(
      rawInput,
      SERVICE_ID_FIELDS,
    );

    const serviceId =
      requireDocumentId(
        rawInput.serviceId,
        "serviceId",
      );

    const provider =
      await requireOwnedServiceProvider(
        actor.uid,
      );

    if (
      !isApprovedProviderForOperations(
        provider.data,
      )
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Your provider account must be approved and active before publishing event services.",
      );
    }

    const reference =
      db
        .collection(COLLECTIONS.addons)
        .doc(serviceId);

    await db.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(
            reference,
          );

        if (!snapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The event service does not exist.",
          );
        }

        const current =
          snapshot.data() ?? {};

        assertOwnedService(
          current,
          provider.id,
          actor.uid,
        );

        if (
          current.isDeleted === true
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Deleted event services cannot be published.",
          );
        }

        if (
          current.status !== "draft"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Only draft event services can be published.",
          );
        }

        const category =
          parseServiceCategory(
            current.category,
          );

        assertServiceCategoryAllowed(
          provider,
          category,
        );

        validatePublishableService(
          current,
        );

        transaction.update(
          reference,
          {
            status:
              "published",

            isPublished:
              true,

            isActive:
              true,

            isAvailable:
              true,

            publishedAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          },
        );

        writeAuditLogInTransaction(
          transaction,
          {
            actorId:
              actor.uid,

            actorRole:
              USER_ROLES.provider,

            action:
              "provider_service.published",

            targetCollection:
              COLLECTIONS.addons,

            targetId:
              serviceId,

            source:
              "cloud_function",

            before: {
              status:
                current.status ?? null,

              isPublished:
                current.isPublished === true,

              isActive:
                current.isActive === true,

              isAvailable:
                current.isAvailable === true,
            },

            after: {
              status:
                "published",

              isPublished:
                true,

              isActive:
                true,

              isAvailable:
                true,
            },

            metadata: {
              providerId:
                provider.id,

              category,
            },
          },
        );
      },
    );

    return {
      success: true,
      serviceId,
      status: "published",
    };
  },
);

/* ========================================================================== */
/* ARCHIVE                                                                    */
/* ========================================================================== */

export const archiveProviderService = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor =
      requireAuth(request);

    await requireRole(
      actor.uid,
      [USER_ROLES.provider],
    );

    await enforceCallableRateLimit(
      request,
      {
        scope:
          "services.archiveProviderService",
        limit: 30,
        windowSeconds: 60 * 60,
      },
    );

    const rawInput =
      requireObject(request.data);

    rejectUnknownFields(
      rawInput,
      SERVICE_ID_FIELDS,
    );

    const serviceId =
      requireDocumentId(
        rawInput.serviceId,
        "serviceId",
      );

    const provider =
      await requireOwnedServiceProvider(
        actor.uid,
      );

    const reference =
      db
        .collection(COLLECTIONS.addons)
        .doc(serviceId);

    await db.runTransaction(
      async (transaction) => {
        const snapshot =
          await transaction.get(
            reference,
          );

        if (!snapshot.exists) {
          throw new HttpsError(
            "not-found",
            "The event service does not exist.",
          );
        }

        const current =
          snapshot.data() ?? {};

        assertOwnedService(
          current,
          provider.id,
          actor.uid,
        );

        if (
          current.isDeleted === true
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Deleted event services cannot be archived.",
          );
        }

        if (
          current.status !== "published"
        ) {
          throw new HttpsError(
            "failed-precondition",
            "Only published event services can be archived.",
          );
        }

        transaction.update(
          reference,
          {
            status:
              "archived",

            isPublished:
              false,

            isActive:
              false,

            isAvailable:
              false,

            archivedAt:
              serverTimestamp(),

            updatedAt:
              serverTimestamp(),
          },
        );

        writeAuditLogInTransaction(
          transaction,
          {
            actorId:
              actor.uid,

            actorRole:
              USER_ROLES.provider,

            action:
              "provider_service.archived",

            targetCollection:
              COLLECTIONS.addons,

            targetId:
              serviceId,

            source:
              "cloud_function",

            before: {
              status:
                current.status ?? null,

              isPublished:
                current.isPublished === true,

              isActive:
                current.isActive === true,

              isAvailable:
                current.isAvailable === true,
            },

            after: {
              status:
                "archived",

              isPublished:
                false,

              isActive:
                false,

              isAvailable:
                false,
            },

            metadata: {
              providerId:
                provider.id,
            },
          },
        );
      },
    );

    return {
      success: true,
      serviceId,
      status: "archived",
    };
  },
);

/* ========================================================================== */
/* PROVIDER AUTHORIZATION                                                     */
/* ========================================================================== */

async function requireOwnedServiceProvider(
  uid: string,
): Promise<OwnedProvider> {
  const snapshot =
    await db
      .collection(
        COLLECTIONS.providers,
      )
      .where(
        "ownerId",
        "==",
        uid,
      )
      .limit(2)
      .get();

  if (snapshot.empty) {
    throw new HttpsError(
      "failed-precondition",
      "A provider profile is required.",
    );
  }

  if (snapshot.size !== 1) {
    throw new HttpsError(
      "failed-precondition",
      "The provider account configuration is invalid.",
    );
  }

  const document =
    snapshot.docs[0];

  const data =
    document.data();

  if (
    data.ownerId !== uid
  ) {
    throw new HttpsError(
      "permission-denied",
      "You do not own this provider account.",
    );
  }

  const providerServiceType =
    parseProviderServiceType(
      data.providerServiceType,
    );

  if (
    providerServiceType !== "addon" &&
    providerServiceType !== "both"
  ) {
    throw new HttpsError(
      "permission-denied",
      "This provider account does not manage event services.",
    );
  }

  const serviceCategories =
    parseProviderServiceCategories(
      data.serviceCategories,
    );

  return {
    id:
      document.id,

    ownerId:
      uid,

    data,

    providerServiceType,

    serviceCategories,
  };
}

function assertOwnedService(
  service: Record<string, unknown>,
  providerId: string,
  uid: string,
): void {
  if (
    service.providerId !== providerId ||
    service.ownerId !== uid
  ) {
    throw new HttpsError(
      "permission-denied",
      "You cannot manage this event service.",
    );
  }
}

/* ========================================================================== */
/* CATEGORY POLICY                                                            */
/* ========================================================================== */

function assertServiceCategoryAllowed(
  provider: OwnedProvider,
  category: ProviderServiceCategory,
): void {
  if (
    !serviceCategoryMatchesProviderType(
      category,
      provider.providerServiceType,
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "This service category is not supported by your provider type.",
    );
  }

  if (
    !provider.serviceCategories.includes(
      category,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This service category is not enabled for your provider profile.",
    );
  }
}

function parseProviderServiceCategories(
  value: unknown,
): ProviderServiceCategory[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.flatMap(
        (entry) => {
          const category =
            parseServiceCategoryOrNull(
              entry,
            );

          return category
            ? [category]
            : [];
        },
      ),
    ),
  ];
}

function parseServiceCategory(
  value: unknown,
): ProviderServiceCategory {
  const category =
    parseServiceCategoryOrNull(
      value,
    );

  if (!category) {
    throw new HttpsError(
      "invalid-argument",
      "The service category is invalid.",
    );
  }

  return category;
}

function parseServiceCategoryOrNull(
  value: unknown,
): ProviderServiceCategory | null {
  return (
    typeof value === "string" &&
    PROVIDER_SERVICE_CATEGORIES.includes(
      value as ProviderServiceCategory,
    )
  )
    ? value as ProviderServiceCategory
    : null;
}

function parseProviderServiceType(
  value: unknown,
): ProviderServiceType {
  if (
    value === "catering" ||
    value === "addon" ||
    value === "both"
  ) {
    return value;
  }

  throw new HttpsError(
    "failed-precondition",
    "The provider service type is invalid.",
  );
}

/* ========================================================================== */
/* INPUT VALIDATION                                                           */
/* ========================================================================== */

function parseServiceInput(
  data: Record<string, unknown>,
): ServiceInput {
  const category =
    parseServiceCategory(
      data.category,
    );

  const pricingType =
    parsePricingType(
      data.pricingType,
    );

  return {
    name:
      requireText(
        data.name,
        "name",
        160,
      ),

    description:
      optionalText(
        data.description,
        1000,
      ),

    category,

    pricingType,

    price:
      parsePrice(
        data.price,
        pricingType,
      ),

    ...parseServiceImage(
      data.imageUrl,
      data.imagePublicId,
    ),
  };
}

function parseServiceImage(
  imageUrlValue: unknown,
  imagePublicIdValue: unknown,
): {
  imageUrl: string | null;
  imagePublicId: string | null;
} {
  const imageUrl =
    optionalServiceImageUrl(
      imageUrlValue,
    );

  const imagePublicId =
    optionalServiceImagePublicId(
      imagePublicIdValue,
    );

  if (
    (imageUrl === null) !==
    (imagePublicId === null)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The service image URL and public ID must be provided together.",
    );
  }

  return {
    imageUrl,
    imagePublicId,
  };
}

function optionalServiceImageUrl(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "string"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The service image URL is invalid.",
    );
  }

  try {
    const url =
      new URL(
        value.trim(),
      );

    if (
      url.protocol !== "https:" ||
      url.hostname !==
        "res.cloudinary.com" ||
      !url.pathname.includes(
        "/image/upload/",
      ) ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      throw new Error();
    }

    return url.toString();
  } catch {
    throw new HttpsError(
      "invalid-argument",
      "The service image URL is invalid.",
    );
  }
}

function optionalServiceImagePublicId(
  value: unknown,
): string | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "string"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The service image public ID is invalid.",
    );
  }

  const normalized =
    value.trim();

  if (
    normalized.length < 1 ||
    normalized.length > 500
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The service image public ID is invalid.",
    );
  }

  return normalized;
}

function parsePricingType(
  value: unknown,
): AddonPricingType {
  if (
    typeof value === "string" &&
    ADDON_PRICING_TYPES.includes(
      value as AddonPricingType,
    )
  ) {
    return value as AddonPricingType;
  }

  throw new HttpsError(
    "invalid-argument",
    "The pricing type is invalid.",
  );
}

function parsePrice(
  value: unknown,
  pricingType: AddonPricingType,
): number | null {
  if (
    pricingType ===
      "custom_quote"
  ) {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100_000_000
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The service price is invalid.",
    );
  }

  return value;
}

function validatePublishableService(
  service: Record<string, unknown>,
): void {
  requireText(
    service.name,
    "name",
    160,
  );

  parseServiceCategory(
    service.category,
  );

  const pricingType =
    parsePricingType(
      service.pricingType,
    );

  parsePrice(
    service.price,
    pricingType,
  );

  parseServiceImage(
    service.imageUrl,
    service.imagePublicId,
  );
}

function requireObject(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The event service data is invalid.",
    );
  }

  return value as
    Record<string, unknown>;
}

function rejectUnknownFields(
  input: Record<string, unknown>,
  allowedFields: readonly string[],
): void {
  const allowed =
    new Set(allowedFields);

  for (
    const field of Object.keys(
      input,
    )
  ) {
    if (!allowed.has(field)) {
      throw new HttpsError(
        "invalid-argument",
        `Unknown field: ${field}.`,
      );
    }
  }
}

function requireDocumentId(
  value: unknown,
  field: string,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} is invalid.`,
    );
  }

  const normalized =
    value.trim();

  if (
    normalized.length < 1 ||
    normalized.length > 128 ||
    normalized.includes("/") ||
    !/^[A-Za-z0-9_-]+$/u.test(
      normalized,
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} is invalid.`,
    );
  }

  return normalized;
}

function requireText(
  value: unknown,
  field: string,
  maximumLength: number,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} is required.`,
    );
  }

  const normalized =
    value
      .trim()
      .replace(/\s+/gu, " ");

  if (
    normalized.length < 1 ||
    normalized.length >
      maximumLength
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} is invalid.`,
    );
  }

  return normalized;
}

function optionalText(
  value: unknown,
  maximumLength: number,
): string {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value
    .trim()
    .replace(/\s+/gu, " ")
    .slice(
      0,
      maximumLength,
    );
}