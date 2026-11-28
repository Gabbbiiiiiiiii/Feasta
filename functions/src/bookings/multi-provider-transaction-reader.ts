import {HttpsError} from "firebase-functions/v2/https";
import {isApprovedProviderForOperations, isProviderPubliclyEligible} from "../shared/constants.js";
import type {Firestore, Transaction} from "firebase-admin/firestore";

import {requireCustomerPackageV2} from
  "../packages/customer-package-v2.js";

import {
  resolveMultiProviderPackageCore,
  type ResolvedMultiProviderPackageCore,
} from "./multi-provider-package-resolver.js";

import type {
  MultiProviderSubmissionEnvelope,
} from "./multi-provider-submission-contract.js";

type UnknownRecord = Record<string, unknown>;


export type TrustedMultiProviderPackage = {
  providerId: string;
  providerOwnerId: string;
  providerData: Readonly<UnknownRecord>;
  packageData: Readonly<UnknownRecord>;
  resolved: ResolvedMultiProviderPackageCore;
};

type Input = {
  transaction: Transaction;
  firestore: Firestore;
  envelope: MultiProviderSubmissionEnvelope;

};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

function ownerId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    return reject("Provider ownership is invalid.");
  }
  return value;
}

/**
 * READ-ONLY trusted package preflight.
 *
 * The surrounding transaction must first establish customer
 * authorization, replay identity, maintenance admission and
 * occasion-publication fences.
 *
 * Provider operational approval is enforced directly using
 * FEASTA's shared isApprovedProviderForOperations authority.
 *
 * This function reads package/provider records and performs
 * package V2 admission. It does not authorize booking writes.
 */
export async function readTrustedMultiProviderPackages(
  input: Input,
): Promise<readonly TrustedMultiProviderPackage[]> {
  const {
    transaction,
    firestore,
    envelope,

  } = input;


  if (
    envelope.schemaVersion !== 1 ||
    envelope.selections.length < 2 ||
    envelope.selections.length > 4
  ) {
    return reject("Multi-provider submission is invalid.");
  }

  const providerIds = new Set<string>();

  for (const entry of envelope.selections) {
    if (providerIds.has(entry.providerId)) {
      return reject("Duplicate provider selection.");
    }
    providerIds.add(entry.providerId);
  }

  // Read all selected provider/package documents from Firestore,
  // never from the Event List's cached display records.
  const rows = await Promise.all(
    envelope.selections.map(async (entry) => {
      const [providerSnapshot, packageSnapshot] =
        await Promise.all([
          transaction.get(
            firestore.collection("providers").doc(entry.providerId),
          ),
          transaction.get(
            firestore.collection("packages").doc(entry.packageId),
          ),
        ]);

      if (
        !providerSnapshot.exists ||
        !packageSnapshot.exists
      ) {
        return reject("A selected provider or package is unavailable.");
      }

      return {
        entry,
        providerData: providerSnapshot.data() ?? {},
        packageData: packageSnapshot.data() ?? {},
      };
    }),
  );

  // Reject ineligible providers before resolving their owner IDs.
  // This preserves the booking submission's operational approval
  // authority and avoids owner reads for invalid providers.
  for (const row of rows) {
    if (!isApprovedProviderForOperations(row.providerData)) {
      return reject("A selected provider is unavailable.");
    }
  }

  // Include every selected provider owner in the transaction read set.
  // Provider approval alone does not prove the owner can receive bookings.
  const ownerSnapshots = await Promise.all(
    rows.map((row) =>
      transaction.get(
        firestore.collection("users").doc(
          ownerId(row.providerData.ownerId),
        ),
      ),
    ),
  );

  const trusted: TrustedMultiProviderPackage[] = [];

  for (const [index, row] of rows.entries()) {
    // Reuse the exact provider approval authority enforced
    // by FEASTA's existing booking submission function.
    if (!isApprovedProviderForOperations(row.providerData)) {
      return reject("A selected provider is unavailable.");
    }

    const ownerSnapshot = ownerSnapshots[index];

    if (
      !ownerSnapshot.exists ||
      !isProviderPubliclyEligible(
        {...row.providerData, id: row.entry.providerId},
        ownerSnapshot.data() ?? {},
      )
    ) {
      return reject("A selected provider or owner is unavailable.");
    }

    const providerOwnerId = ownerId(
      row.providerData.ownerId,
    );

    const configuration = row.entry.configuration;
    const version = configuration.sharedContractVersion;

    // Only the trusted package record establishes V2 status.
    // Client metadata cannot authorize this branch.
    const expectsV2 =
      row.packageData.occasionSchemaVersion === 2 &&
      version === 2;

    if (expectsV2) {
      await requireCustomerPackageV2(
        transaction,
        row.packageData,
        "booking",
      );
    }

    const resolved = resolveMultiProviderPackageCore({
      entry: row.entry,
      packageData: row.packageData,
      eventType: String(envelope.event.eventType),
      guestCount: Number(envelope.event.guestCount),
      verifiedV2: expectsV2,
    });

    trusted.push({
      providerId: row.entry.providerId,
      providerOwnerId,
      providerData: row.providerData,
      packageData: row.packageData,
      resolved,
    });
  }

  return trusted;
}