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
  createProviderUploadSignature,
  deleteProviderMedia,
  type ProviderMediaType,
} from "../shared/cloudinary.js";
import {
  USER_ROLES,
} from "../shared/constants.js";
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

      const mediaType = providerMediaType(
        input.mediaType,
      );

      return createProviderUploadSignature(
        actor.uid,
        mediaType,
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

      const mediaType = providerMediaType(
        input.mediaType,
      );

      return deleteProviderMedia(
        actor.uid,
        mediaType,
      );
    },
  );

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