import {HttpsError} from "firebase-functions/v2/https";
import type {Firestore, Transaction} from "firebase-admin/firestore";



import {
  resolveTrustedMarketplaceService,
  type TrustedMarketplaceService,
} from "./multi-provider-marketplace-service.js";

type UnknownRecord = Readonly<Record<string, unknown>>;

type Input = {
  transaction: Transaction;
  firestore: Firestore;
  providerId: string;
  ownerId: string;
  providerData: UnknownRecord;
  serviceId: string;
  expectedRevision: number;
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

/**
 * Reads one marketplace service inside the caller's booking transaction.
 *
 * The caller must independently establish:
 * - customer booking authorization and restrictions
 * - provider operational/public eligibility
 * - active service-category eligibility
 * - event availability and occupancy
 * - marketplace full-payment, refund and agreement authority
 *
 * This module makes no Firestore writes and does not authorize
 * coordinated booking submission by itself.
 */
export async function readTrustedMarketplaceService(
  input: Input,
): Promise<TrustedMarketplaceService> {
  const {
    transaction,
    firestore,
    providerId,
    ownerId,
    providerData,
    serviceId,
    expectedRevision,
  } = input;

  if (
    !transaction ||
    typeof transaction.get !== "function" ||
    !firestore ||
    typeof firestore.collection !== "function" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1
  ) {
    return reject("Marketplace service read input is invalid.");
  }

  const MARKETPLACE_ID_PATTERN = /^[A-Za-z0-9_-]{8,160}$/u;

  if (
    typeof serviceId !== "string" ||
    !MARKETPLACE_ID_PATTERN.test(serviceId) ||
    typeof providerId !== "string" ||
    !MARKETPLACE_ID_PATTERN.test(providerId) ||
    typeof ownerId !== "string" ||
    !MARKETPLACE_ID_PATTERN.test(ownerId)
  ) {
    return reject("Marketplace service identity is invalid.");
  }

  const reference = firestore
    .collection("addons")
    .doc(serviceId);

  const snapshot = await transaction.get(reference);

  if (!snapshot.exists) {
    return reject("Marketplace service is unavailable.");
  }

  const stored = snapshot.data();

  if (
    !stored ||
    typeof stored !== "object" ||
    Array.isArray(stored)
  ) {
    return reject("Marketplace service record is invalid.");
  }

  if (stored.revision !== expectedRevision) {
    throw new HttpsError(
      "aborted",
      "Marketplace service changed. Reload your selections.",
    );
  }

  return resolveTrustedMarketplaceService({
    serviceId,
    providerId,
    ownerId,
    providerData,
    serviceData: stored,
  });
}