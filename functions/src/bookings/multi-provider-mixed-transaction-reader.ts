import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore, Transaction} from "firebase-admin/firestore";

import {
  isApprovedProviderForOperations,
  isProviderPubliclyEligible,
} from "../shared/constants.js";

import {requireCustomerPackageV2} from
  "../packages/customer-package-v2.js";

import {
  resolveMultiProviderPackageCore,
  type ResolvedMultiProviderPackageCore,
} from "./multi-provider-package-resolver.js";

import {
  readTrustedMarketplaceService,
} from "./multi-provider-marketplace-reader.js";

import type {
  TrustedMarketplaceService,
} from "./multi-provider-marketplace-service.js";

import type {
  MultiProviderMixedSubmissionEnvelope,
  MultiProviderMixedCateringSelection,
  MultiProviderMarketplaceSelection,
} from "./multi-provider-submission-contract.js";

type UnknownRecord = Readonly<Record<string, unknown>>;

export type TrustedMixedCateringRow = {
  kind: "catering_package";
  providerId: string;
  providerOwnerId: string;
  providerData: UnknownRecord;
  packageData: UnknownRecord;
  resolved: ResolvedMultiProviderPackageCore;
};

export type TrustedMixedMarketplaceRow = {
  kind: "marketplace_service";
  providerId: string;
  providerOwnerId: string;
  providerData: UnknownRecord;
  service: TrustedMarketplaceService;
};

export type TrustedMixedProviderRow =
  | TrustedMixedCateringRow
  | TrustedMixedMarketplaceRow;

type Input = {
  transaction: Transaction;
  firestore: Firestore;
  envelope: MultiProviderMixedSubmissionEnvelope;
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

function ownerId(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{8,160}$/u.test(value)
  ) {
    return reject("Provider ownership is invalid.");
  }

  return value;
}

/**
 * Read-only mixed-provider transaction preflight.
 *
 * This reuses Catering package authorization and the dedicated
 * marketplace service reader without treating a service as a package.
 *
 * The calling booking coordinator must separately establish:
 * customer authorization; maintenance and occasion admission;
 * active marketplace categories; payment/refund agreements;
 * event availability; idempotency; and atomic writes.
 *
 * No booking writes are performed here.
 */
export async function readTrustedMixedProviderSelections(
  input: Input,
): Promise<readonly TrustedMixedProviderRow[]> {
  const {transaction, firestore, envelope} = input;

  if (
    !transaction ||
    typeof transaction.get !== "function" ||
    !firestore ||
    typeof firestore.collection !== "function" ||
    !envelope ||
    envelope.schemaVersion !== 2 ||
    !Array.isArray(envelope.selections) ||
    envelope.selections.length < 1 ||
    envelope.selections.length > 4
  ) {
    return reject("Mixed-provider submission is invalid.");
  }

  const providerIds = new Set<string>();

  for (const entry of envelope.selections) {
    if (
      !entry ||
      typeof entry.providerId !== "string" ||
      !/^[A-Za-z0-9_-]{8,160}$/u.test(entry.providerId) ||
      providerIds.has(entry.providerId)
    ) {
      return reject("Mixed-provider identity is invalid.");
    }

    providerIds.add(entry.providerId);
  }

  // Phase 1: Read every provider from the authoritative collection.
  const providerSnapshots = await Promise.all(
    envelope.selections.map((entry) =>
      transaction.get(
        firestore.collection("providers").doc(entry.providerId),
      ),
    ),
  );

  const providerData = providerSnapshots.map((snapshot) => {
    if (!snapshot.exists) {
      return reject("A selected provider is unavailable.");
    }

    const data = snapshot.data() ?? {};

    if (!isApprovedProviderForOperations(data)) {
      return reject("A selected provider is unavailable.");
    }

    return data;
  });

  // Phase 2: Load every provider owner's current account.
  const owners = providerData.map((provider) =>
    ownerId(provider.ownerId),
  );

  const ownerSnapshots = await Promise.all(
    owners.map((id) =>
      transaction.get(firestore.collection("users").doc(id)),
    ),
  );

  for (let index = 0; index < providerData.length; index++) {
    if (
      !ownerSnapshots[index].exists ||
      !isProviderPubliclyEligible(
        {
          ...providerData[index],
          id: envelope.selections[index].providerId,
        },
        ownerSnapshots[index].data() ?? {},
      )
    ) {
      return reject("A selected provider or owner is unavailable.");
    }
  }

  // Phase 3: Resolve each selection against its own authority.
  // The output order always matches the customer's selection order.
  return Promise.all(
    envelope.selections.map(async (selection, index) => {
      const provider = providerData[index];
      const providerOwnerId = owners[index];

      if (selection.kind === "marketplace_service") {
        const marketplaceSelection =
          selection as MultiProviderMarketplaceSelection;

        const service = await readTrustedMarketplaceService({
          transaction,
          firestore,
          providerId: marketplaceSelection.providerId,
          ownerId: providerOwnerId,
          providerData: provider,
          serviceId: marketplaceSelection.serviceId,
          expectedRevision: marketplaceSelection.expectedRevision,
          allowLegacyRevision: envelope.selections.length === 1,
        });

        if (envelope.selections.length === 1 &&
            service.category !== "photographer" && service.category !== "videographer") {
          return reject("Standalone booking is available for photography and videography packages.");
        }

        const row: TrustedMixedMarketplaceRow = {
          kind: "marketplace_service",
          providerId: marketplaceSelection.providerId,
          providerOwnerId,
          providerData: provider,
          service,
        };

        return row;
      }

      if (selection.kind !== "catering_package" || envelope.selections.length === 1) {
        return reject("Mixed-provider selection kind is invalid.");
      }

      const catering =
        selection as MultiProviderMixedCateringSelection;

      if (provider.providerServiceType !== "catering") {
        return reject("Catering package provider type is invalid.");
      }

      const packageSnapshot = await transaction.get(
        firestore.collection("packages").doc(catering.packageId),
      );

      if (!packageSnapshot.exists) {
        return reject("A selected Catering package is unavailable.");
      }

      const packageData = packageSnapshot.data() ?? {};
      const version = catering.configuration.sharedContractVersion;

      const expectsV2 =
        packageData.occasionSchemaVersion === 2 &&
        version === 2;

      if (expectsV2) {
        await requireCustomerPackageV2(
          transaction,
          packageData,
          "booking",
        );
      }

      const resolved = resolveMultiProviderPackageCore({
        entry: catering,
        packageData,
        eventType: String(envelope.event.eventType),
        guestCount: Number(envelope.event.guestCount),
        verifiedV2: expectsV2,
      });

      const row: TrustedMixedCateringRow = {
        kind: "catering_package",
        providerId: catering.providerId,
        providerOwnerId,
        providerData: provider,
        packageData,
        resolved,
      };

      return row;
    }),
  );
}