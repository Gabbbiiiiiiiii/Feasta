import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  requireAuth,
} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {
  cloudinarySecrets,
  createProviderServiceImageUploadSignature as
    createServiceImageUploadSignature,
  createProviderUploadSignature,
  deleteProviderMedia,
  deleteProviderServiceImage as
    deleteServiceImage,
  type ProviderMediaType,
} from "../shared/cloudinary.js";
import {
  USER_ROLES,
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
  requireObject,
} from "../shared/validation.js";

export const createProviderMediaUploadSignature =
  onCall(
    {
      ...appCheckCallableOptions,
      secrets: cloudinarySecrets,
      timeoutSeconds: 15,
    },
    async (request) => {
      const actor = requireAuth(request);

      await requireRole(actor.uid, [
        USER_ROLES.provider,
      ]);

      await enforceCallableRateLimit(request, {
        scope:
          "createProviderMediaUploadSignature",
        limit: 20,
        windowSeconds: 10 * 60,
      });

      const input = requireObject(
        request.data ?? {},
      );

      rejectUnknownFields(
        input,
        [
          "mediaType",
        ],
      );

      const mediaType = providerMediaType(
        input.mediaType,
      );

      return createProviderUploadSignature(
        actor.uid,
        mediaType,
      );
    },
  );

export const createProviderServiceImageUploadSignature =
  onCall(
    {
      ...appCheckCallableOptions,
      secrets: cloudinarySecrets,
      timeoutSeconds: 15,
    },
    async (request) => {
      const actor =
        requireAuth(request);

      await requireRole(
        actor.uid,
        [
          USER_ROLES.provider,
        ],
      );

      await enforceCallableRateLimit(
        request,
        {
          scope:
            "createProviderServiceImageUploadSignature",
          limit: 30,
          windowSeconds:
            10 * 60,
        },
      );

      const input =
        requireObject(
          request.data ?? {},
        );

      rejectUnknownFields(
        input,
        [
          "serviceId",
        ],
      );

      const serviceId =
        requireServiceId(
          input.serviceId,
        );

      return createServiceImageUploadSignature(
        actor.uid,
        serviceId,
      );
    },
  );

export const deleteProviderOnboardingMedia =
  onCall(
    {
      ...appCheckCallableOptions,
      secrets: cloudinarySecrets,
      timeoutSeconds: 20,
    },
    async (request) => {
      const actor = requireAuth(request);

      await requireRole(actor.uid, [
        USER_ROLES.provider,
      ]);

      await enforceCallableRateLimit(request, {
        scope:
          "deleteProviderOnboardingMedia",
        limit: 20,
        windowSeconds: 10 * 60,
      });

      const input = requireObject(
        request.data ?? {},
      );

      rejectUnknownFields(
        input,
        [
          "mediaType",
        ],
      );

      const mediaType = providerMediaType(
        input.mediaType,
      );

      await requireEditableProviderOnboarding(
        actor.uid,
      );

      return deleteProviderMedia(
        actor.uid,
        mediaType,
      );
    },
  );

export const deleteProviderServiceImage =
  onCall(
    {
      ...appCheckCallableOptions,
      secrets: cloudinarySecrets,
      timeoutSeconds: 20,
    },
    async (request) => {
      const actor =
        requireAuth(request);

      await requireRole(
        actor.uid,
        [
          USER_ROLES.provider,
        ],
      );

      await enforceCallableRateLimit(
        request,
        {
          scope:
            "deleteProviderServiceImage",
          limit: 30,
          windowSeconds:
            10 * 60,
        },
      );

      const input =
        requireObject(
          request.data ?? {},
        );

      rejectUnknownFields(
        input,
        [
          "serviceId",
        ],
      );

      const serviceId =
        requireServiceId(
          input.serviceId,
        );

      return deleteServiceImage(
        actor.uid,
        serviceId,
      );
    },
  );

async function requireEditableProviderOnboarding(
  ownerId: string,
): Promise<void> {
  const userSnapshot = await db
    .collection("users")
    .doc(ownerId)
    .get();

  const user =
    userSnapshot.data() ?? {};

  if (
    !userSnapshot.exists ||
    user.role !== USER_ROLES.provider ||
    user.accountStatus !== "active" ||
    user.isActive !== true ||
    user.isBlocked !== false
  ) {
    throw new HttpsError(
      "permission-denied",
      "The provider account is invalid.",
    );
  }

  const providerId =
    typeof user.providerId === "string"
      ? user.providerId.trim()
      : "";

  if (!providerId) {
    return;
  }

  const providerSnapshot =
    await db
      .collection("providers")
      .doc(providerId)
      .get();

  const provider =
    providerSnapshot.data() ?? {};

  if (
    !providerSnapshot.exists ||
    provider.ownerId !== ownerId
  ) {
    throw new HttpsError(
      "permission-denied",
      "The linked provider application could not be verified.",
    );
  }

  const verificationSnapshot =
    await db
      .collection(
        "providerVerifications",
      )
      .where(
        "providerId",
        "==",
        providerId,
      )
      .limit(1)
      .get();

  if (
    verificationSnapshot.empty
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The linked provider verification record is missing.",
    );
  }

  const verification =
    verificationSnapshot.docs[0]
      .data();

  const editable =
    (
      provider.verificationStatus ===
        "draft" ||
      provider.verificationStatus ===
        "resubmission_required"
    ) &&
    (
      verification.status ===
        "draft" ||
      verification.status ===
        "resubmission_required"
    );

  if (
    verification.ownerId !== ownerId ||
    !editable
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Provider application media is locked after submission.",
    );
  }
}

function providerMediaType(
  value: unknown,
): ProviderMediaType {
  if (
    value !== "logo" &&
    value !== "cover"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "mediaType must be logo or cover.",
    );
  }

  return value;
}

function requireServiceId(
  value: unknown,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "serviceId is invalid.",
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
      "serviceId is invalid.",
    );
  }

  return normalized;
}

function rejectUnknownFields(
  input: Record<string, unknown>,
  allowedFields: readonly string[],
): void {
  const allowed =
    new Set(
      allowedFields,
    );

  for (
    const field of Object.keys(
      input,
    )
  ) {
    if (
      !allowed.has(
        field,
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        `Unknown field: ${field}.`,
      );
    }
  }
}
