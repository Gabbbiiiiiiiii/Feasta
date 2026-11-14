import {HttpsError} from "firebase-functions/v2/https";
import {Timestamp} from "firebase-admin/firestore";

import type {
  Firestore,
  Transaction,
} from "firebase-admin/firestore";

import {
  AVAILABILITY_COUNTED_REQUEST_STATUSES,
  manilaDateRange,
  type ExistingProviderBooking,
} from "../provider-availability/validate-provider-availability.js";

export type MultiProviderOccupancySelection = {
  providerId: string;
  providerRequestId: string;
  eventDate: Date;
};

type Input = {
  transaction: Transaction;
  firestore: Firestore;
  selections: readonly MultiProviderOccupancySelection[];
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

/**
 * Read all selected providers' occupancy from Firestore.
 *
 * Must be called inside the same authoritative booking transaction
 * used to validate the entire multi-provider submission.
 *
 * The caller provides previously validated server-side provider
 * identities, generated request IDs, and a shared event date.
 *
 * Query semantics match submitBookingRequest:
 * - providerId equality
 * - Asia/Manila event-date window
 * - counted provider-request statuses
 *
 * This reader does not reserve dates, approve requests, or write.
 */
export async function readMultiProviderOccupancy(
  input: Input,
): Promise<ReadonlyMap<string, readonly ExistingProviderBooking[]>> {
  const {transaction, firestore, selections} = input;

  if (
    !transaction ||
    typeof transaction.get !== "function" ||
    !firestore ||
    typeof firestore.collection !== "function" ||
    !Array.isArray(selections) ||
    selections.length < 2 ||
    selections.length > 4
  ) {
    return reject("Multi-provider occupancy input is invalid.");
  }

  const providerIds = new Set<string>();
  const requestIds = new Set<string>();

  let sharedDateKey: string | null = null;
  let dateWindow: ReturnType<typeof manilaDateRange> = null;

  // Validate every selection before issuing any Firestore query.
  for (const selection of selections) {
    const window = selection?.eventDate instanceof Date
      ? manilaDateRange(selection.eventDate)
      : null;

    if (
      !selection ||
      typeof selection.providerId !== "string" ||
      !/^[A-Za-z0-9_-]{2,160}$/.test(selection.providerId) ||
      typeof selection.providerRequestId !== "string" ||
      !/^[A-Za-z0-9_-]{2,200}$/.test(selection.providerRequestId) ||
      providerIds.has(selection.providerId) ||
      requestIds.has(selection.providerRequestId) ||
      !window ||
      (sharedDateKey !== null &&
        sharedDateKey !== window.dateKey)
    ) {
      return reject("Multi-provider occupancy selection is invalid.");
    }

    providerIds.add(selection.providerId);
    requestIds.add(selection.providerRequestId);
    sharedDateKey = window.dateKey;
    dateWindow = window;
  }

  if (!dateWindow) {
    return reject("Multi-provider event date is invalid.");
  }

  const start = Timestamp.fromDate(dateWindow.start);
  const end = Timestamp.fromDate(dateWindow.end);

  // Read the complete provider/date occupancy set for each provider.
  // No booking writes may occur before these transaction reads.
  const snapshots = await Promise.all(
    selections.map((selection) => {
      const query = firestore
        .collection("providerRequests")
        .where("providerId", "==", selection.providerId)
        .where("eventDate", ">=", start)
        .where("eventDate", "<", end)
        .where(
          "status",
          "in",
          [...AVAILABILITY_COUNTED_REQUEST_STATUSES],
        );

      return transaction.get(query);
    }),
  );

  const result = new Map<
    string,
    readonly ExistingProviderBooking[]
  >();

  selections.forEach((selection, index) => {
    const snapshot = snapshots[index];

    if (!snapshot || !Array.isArray(snapshot.docs)) {
      reject("Provider occupancy records are unavailable.");
    }

    const bookings: ExistingProviderBooking[] =
      snapshot.docs.map((document) => {
        if (
          !document ||
          typeof document.id !== "string" ||
          !document.id.trim() ||
          typeof document.data !== "function"
        ) {
          return reject("Provider occupancy records are invalid.");
        }

        const data = document.data();

        if (
          !data ||
          typeof data !== "object" ||
          Array.isArray(data)
        ) {
          return reject("Provider occupancy records are invalid.");
        }

        // Preserve payment/reconciliation evidence for FEASTA's
        // existing occupancy-state calculation.
        return {
          ...data,
          providerRequestId: document.id,
          status: data.status,
          eventTime: data.eventTime,
          eventEndTime: data.eventEndTime,
          expiresAt: data.expiresAt,
          acceptedAt: data.acceptedAt,
        };
      });

    result.set(selection.providerId, bookings);
  });

  return result;
}