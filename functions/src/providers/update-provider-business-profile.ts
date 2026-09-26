import {HttpsError, onCall} from "firebase-functions/v2/https";

import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {
  deleteProviderMedia,
  cloudinarySecrets,
  verifyProviderMedia,
} from "../shared/cloudinary.js";
import {
  isApprovedProviderForOperations,
  isProviderOwnerAccountActive,
  shouldPublishProvider,
  USER_ROLES,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {
  validateProviderBusinessProfileUpdate,
  type ValidatedProviderBusinessProfileUpdate,
} from "./provider-business-profile-domain.js";

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const MAX_COVER_BYTES = 10 * 1024 * 1024;

export const updateProviderBusinessProfile = onCall(
  {
    ...appCheckCallableOptions,
    secrets: cloudinarySecrets,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.provider]);
    await enforceCallableRateLimit(request, {
      scope: "providerBusinessProfile.update",
      limit: 15,
      windowSeconds: 10 * 60,
    });

    const input = validateProviderBusinessProfileUpdate(request.data ?? {});
    const userReference = db.collection("users").doc(actor.uid);
    const userSnapshot = await userReference.get();
    const providerId = documentId(userSnapshot.data()?.providerId);

    if (
      !userSnapshot.exists ||
      userSnapshot.data()?.role !== USER_ROLES.provider ||
      !providerId
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Your provider profile is not linked.",
      );
    }

    const providerReference = db.collection("providers").doc(providerId);
    const initialProviderSnapshot = await providerReference.get();
    const initialProvider = initialProviderSnapshot.data() ?? {};

    if (
      !initialProviderSnapshot.exists ||
      initialProvider.ownerId !== actor.uid
    ) {
      throw new HttpsError(
        "permission-denied",
        "Provider business profile ownership could not be verified.",
      );
    }
    if (!isApprovedProviderForOperations(initialProvider)) {
      throw new HttpsError(
        "failed-precondition",
        "Your provider business profile is not available for editing.",
      );
    }

    await verifySubmittedMedia(actor.uid, input);

    const result = await db.runTransaction(async (transaction) => {
      const [currentUserSnapshot, providerSnapshot] = await transaction.getAll(
        userReference,
        providerReference,
      );
      const currentUser = currentUserSnapshot.data() ?? {};
      const provider = providerSnapshot.data() ?? {};

      if (
        !currentUserSnapshot.exists ||
        currentUser.role !== USER_ROLES.provider ||
        currentUser.providerId !== providerId ||
        !providerSnapshot.exists ||
        provider.ownerId !== actor.uid
      ) {
        throw new HttpsError(
          "permission-denied",
          "Provider business profile ownership could not be verified.",
        );
      }

      if (
        !isApprovedProviderForOperations(provider) ||
        !isProviderOwnerAccountActive(providerId, currentUser)
      ) {
        throw new HttpsError(
          "failed-precondition",
          "Your provider business profile is not available for editing.",
        );
      }

      const requested = firestoreUpdates(input);
      const changedFields = Object.keys(requested).filter(
        (field) => !sameValue(provider[field], requested[field]),
      );

      if (changedFields.length === 0) {
        return {providerId, updated: false, updatedFields: [] as string[]};
      }

      const changes = Object.fromEntries(
        changedFields.map((field) => [field, requested[field]]),
      );
      const nextProvider: Record<string, unknown> = {
        ...provider,
        ...changes,
        id: providerId,
      };

      if (
        changedFields.some((field) =>
          field === "address" || field === "city" || field === "province"
        )
      ) {
        changes.location = `${stringValue(nextProvider.city)}, ${
          stringValue(nextProvider.province)
        }`;
      }

      changes.searchTokens = buildSearchTokens([
        stringValue(nextProvider.businessName),
        stringValue(nextProvider.city),
        stringValue(nextProvider.province),
        stringValue(nextProvider.providerServiceType),
        stringValue(nextProvider.providerCategory),
        ...stringArray(nextProvider.serviceCategories),
        ...stringArray(nextProvider.serviceAreas),
        ...stringArray(nextProvider.eventTypesSupported),
      ]);
      changes.publiclyVisible = shouldPublishProvider(
        {...nextProvider, ...changes},
        currentUser,
      );
      changes.updatedAt = serverTimestamp();

      transaction.update(providerReference, changes);
      writeAuditLogInTransaction(transaction, {
        actorId: actor.uid,
        actorRole: USER_ROLES.provider,
        action: "provider.business_profile_updated",
        targetCollection: "providers",
        targetId: providerId,
        before: Object.fromEntries(
          changedFields.map((field) => [field, provider[field] ?? null]),
        ),
        after: Object.fromEntries(
          changedFields.map((field) => [field, requested[field] ?? null]),
        ),
        metadata: {fields: changedFields},
      });

      return {providerId, updated: true, updatedFields: changedFields};
    });

    await deleteClearedMedia(actor.uid, input);
    return result;
  },
);

async function verifySubmittedMedia(
  ownerId: string,
  input: ValidatedProviderBusinessProfileUpdate,
): Promise<void> {
  const checks: Promise<void>[] = [];

  if (input.logo) {
    checks.push(verifyProviderMedia({
      ownerId,
      mediaType: "logo",
      url: input.logo.url,
      publicId: input.logo.publicId,
      maximumBytes: MAX_LOGO_BYTES,
    }));
  }
  if (input.coverImage) {
    checks.push(verifyProviderMedia({
      ownerId,
      mediaType: "cover",
      url: input.coverImage.url,
      publicId: input.coverImage.publicId,
      maximumBytes: MAX_COVER_BYTES,
    }));
  }

  await Promise.all(checks);
}

async function deleteClearedMedia(
  ownerId: string,
  input: ValidatedProviderBusinessProfileUpdate,
): Promise<void> {
  const deletions: Promise<unknown>[] = [];
  if (input.logo === null) {
    deletions.push(deleteProviderMedia(ownerId, "logo"));
  }
  if (input.coverImage === null) {
    deletions.push(deleteProviderMedia(ownerId, "cover"));
  }
  await Promise.all(deletions);
}

function firestoreUpdates(
  input: ValidatedProviderBusinessProfileUpdate,
): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  for (const field of [
    "businessPhone",
    "description",
    "address",
    "city",
    "province",
  ] as const) {
    if (field in input) updates[field] = input[field];
  }
  if ("logo" in input) {
    updates.logoUrl = input.logo?.url ?? null;
    updates.logoPublicId = input.logo?.publicId ?? null;
  }
  if ("coverImage" in input) {
    updates.coverImageUrl = input.coverImage?.url ?? null;
    updates.coverPublicId = input.coverImage?.publicId ?? null;
  }
  return updates;
}

function documentId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{1,160}$/u.test(normalized) ? normalized : null;
}

function sameValue(left: unknown, right: unknown): boolean {
  return left === right || (left == null && right === null);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const normalized = stringValue(item);
    return normalized ? [normalized] : [];
  });
}

function buildSearchTokens(values: readonly string[]): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
    for (const word of value.toLowerCase().split(/[^a-z0-9]+/u)) {
      if (!word) continue;
      tokens.add(word);
      for (let length = 2; length <= Math.min(word.length, 20); length++) {
        tokens.add(word.slice(0, length));
      }
    }
  }
  return [...tokens].slice(0, 200);
}
