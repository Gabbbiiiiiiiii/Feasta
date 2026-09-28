import type {
  DocumentData,
  DocumentSnapshot,
} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  isProviderPubliclyEligible,
} from "../shared/constants.js";
import {requireAuth} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {db} from "../shared/firestore.js";
import {
  appCheckCallableOptions,
} from "../shared/function-options.js";
import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";
import {
  requireSafeDocumentId,
} from "../refund-policies/refund-policy-domain.js";
import {
  parseBookingRefundPolicyRollout,
  refundPolicyDisclosures,
  resolveBookingRefundPolicies,
  REFUND_POLICY_ROLLOUT_DOCUMENT_ID,
  type BookingRefundPolicyRelationship,
} from "./booking-refund-policy.js";

type UnknownRecord = Record<string, unknown>;

const INPUT_FIELDS = new Set([
  "cateringSelectionType",
  "providerId",
  "packageId",
  "addonIds",
]);

const MAX_ADDONS = 20;

export const getBookingRefundPolicyDisclosures = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);

    await requireRole(
      actor.uid,
      ["customer"],
    );

    await enforceCallableRateLimit(
      request,
      {
        scope:
          "bookings.refundPolicyDisclosure",
        limit: 30,
        windowSeconds: 10 * 60,
      },
    );

    const input = requireInput(request.data);
    const cateringSelectionType =
      parseCateringSelectionType(
        input.cateringSelectionType,
      );
    const providerId = safeId(
      input.providerId,
      "Provider",
    );
    const packageId = cateringSelectionType === "package"
      ? safeId(
          input.packageId,
          "Package",
        )
      : null;
    const addonIds = safeIdList(
      input.addonIds,
    );

    return db.runTransaction(
      async (transaction) => {
        const rolloutReference = db
          .collection("appSettings")
          .doc(
            REFUND_POLICY_ROLLOUT_DOCUMENT_ID,
          );
        const addonReferences = addonIds.map(
          (addonId) =>
            db.collection("addons").doc(addonId),
        );
        const packageSnapshot = packageId
          ? await transaction.get(
              db.collection("packages").doc(packageId),
            )
          : null;
        const rolloutSnapshot =
          await transaction.get(rolloutReference);
        const addonSnapshots = await Promise.all(
          addonReferences.map(
            (reference) =>
              transaction.get(reference),
          ),
        );

        const packageData = packageSnapshot
          ? requirePublicPackage(
              packageSnapshot,
              providerId,
            )
          : null;
        const addons = addonSnapshots.map(
          (snapshot) =>
            requirePublicAddon(snapshot),
        );
        const providerIds = [
          ...new Set([
            providerId,
            ...addons.map(
              (addon) => addon.providerId,
            ),
          ]),
        ];
        const providerReferences =
          providerIds.map(
            (id) =>
              db.collection("providers").doc(id),
          );
        const providerSnapshots =
          await Promise.all(
            providerReferences.map(
              (reference) =>
                transaction.get(reference),
            ),
          );
        const providerOwnerIds =
          providerSnapshots.map(
            (snapshot) =>
              providerOwnerId(snapshot),
          );
        const ownerSnapshots =
          await Promise.all(
            providerOwnerIds.map(
              (ownerId) =>
                transaction.get(
                  db.collection("users")
                    .doc(ownerId),
                ),
            ),
          );
        const providers = new Map<
          string,
          UnknownRecord
        >();

        providerSnapshots.forEach(
          (snapshot, index) => {
            const provider =
              snapshot.data() ?? {};
            const owner =
              ownerSnapshots[index]
                ?.data() ?? {};

            if (
              !isProviderPubliclyEligible(
                {
                  ...provider,
                  id: snapshot.id,
                },
                owner,
              )
            ) {
              throw selectionUnavailable();
            }

            providers.set(snapshot.id, provider);
          },
        );

        for (const addon of addons) {
          const provider = providers.get(
            addon.providerId,
          );

          if (
            !provider ||
            provider.ownerId !== addon.ownerId
          ) {
            throw selectionUnavailable();
          }
        }

        const relationships:
          BookingRefundPolicyRelationship[] =
          providerIds.map((id) => {
            const provider = providers.get(id);

            if (!provider) {
              throw selectionUnavailable();
            }

            return {
              providerId: id,
              providerName:
                stringValue(
                  provider.businessName,
                ),
              providerData: provider,
              packageRecord:
                id === providerId &&
                packageId &&
                packageData
                  ? {
                      packageId,
                      data: packageData,
                    }
                  : null,
            };
          });
        const policies =
          resolveBookingRefundPolicies(
            relationships,
          );
        const rolloutMode =
          parseBookingRefundPolicyRollout({
            exists: rolloutSnapshot.exists,
            data: rolloutSnapshot.data(),
          });

        return {
          rolloutMode,
          acknowledgementsRequired:
            rolloutMode === "required",
          policies:
            refundPolicyDisclosures(policies),
        };
      },
    );
  },
);

function requireInput(
  value: unknown,
): UnknownRecord {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw invalidInput();
  }

  const input = value as UnknownRecord;
  const fields = Object.keys(input);

  if (
    fields.some(
      (field) => !INPUT_FIELDS.has(field),
    )
  ) {
    throw invalidInput();
  }

  const cateringSelectionType =
    parseCateringSelectionType(
      input.cateringSelectionType,
    );

  if (
    !("providerId" in input) ||
    !("addonIds" in input)
  ) {
    throw invalidInput();
  }

  if (cateringSelectionType === "package") {
    if (!("packageId" in input)) {
      throw invalidInput();
    }
  } else if ("packageId" in input) {
    throw invalidInput();
  }

  return input;
}

function parseCateringSelectionType(
  value: unknown,
): "package" | "custom_menu" {
  // Existing package callers omit this field.
  if (
    value === undefined ||
    value === "package"
  ) {
    return "package";
  }

  if (value === "custom_menu") {
    return "custom_menu";
  }

  throw invalidInput();
}

function safeId(
  value: unknown,
  label: string,
): string {
  try {
    return requireSafeDocumentId(
      value,
      label,
    );
  } catch {
    throw invalidInput();
  }
}

function safeIdList(
  value: unknown,
): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_ADDONS
  ) {
    throw invalidInput();
  }

  const result = value.map(
    (candidate) =>
      safeId(candidate, "Add-on"),
  );

  if (new Set(result).size !== result.length) {
    throw invalidInput();
  }

  return result;
}

function requirePublicPackage(
  snapshot:
    DocumentSnapshot<DocumentData>,
  expectedProviderId: string,
): UnknownRecord {
  if (!snapshot.exists) {
    throw selectionUnavailable();
  }

  const packageData = snapshot.data() ?? {};

  if (
    packageData.providerId !==
      expectedProviderId ||
    packageData.status !== "published" ||
    packageData.isActive !== true ||
    packageData.isPublished !== true ||
    packageData.providerPubliclyVisible !== true ||
    packageData.isDeleted === true
  ) {
    throw selectionUnavailable();
  }

  return packageData;
}

function requirePublicAddon(
  snapshot:
    DocumentSnapshot<DocumentData>,
): {
  providerId: string;
  ownerId: string;
} {
  if (!snapshot.exists) {
    throw selectionUnavailable();
  }

  const addon = snapshot.data() ?? {};

  if (
    addon.status !== "published" ||
    addon.isActive !== true ||
    addon.isAvailable !== true ||
    addon.isPublished !== true ||
    addon.isDeleted === true
  ) {
    throw selectionUnavailable();
  }

  return {
    providerId: safeId(
      addon.providerId,
      "Provider",
    ),
    ownerId: safeId(
      addon.ownerId,
      "Provider owner",
    ),
  };
}

function providerOwnerId(
  snapshot:
    DocumentSnapshot<DocumentData>,
): string {
  if (!snapshot.exists) {
    throw selectionUnavailable();
  }

  return safeId(
    snapshot.data()?.ownerId,
    "Provider owner",
  );
}

function invalidInput(): HttpsError {
  return new HttpsError(
    "invalid-argument",
    "Refund policy disclosure request is invalid.",
  );
}

function selectionUnavailable(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "A selected booking service is unavailable.",
    {reason: "BOOKING_SELECTION_UNAVAILABLE"},
  );
}

function stringValue(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}
