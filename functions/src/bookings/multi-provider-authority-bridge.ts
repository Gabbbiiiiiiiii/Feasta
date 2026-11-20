import {createHash} from "node:crypto";
import {HttpsError} from "firebase-functions/v2/https";

import type {
  Firestore,
  Transaction,
} from "firebase-admin/firestore";

import {
  readTrustedMultiProviderPackages,
  type TrustedMultiProviderPackage,
} from "./multi-provider-transaction-reader.js";

import {
  prepareMultiProviderFinancials,
} from "./multi-provider-financial-preparation.js";

import {
  prepareMultiProviderPaymentEligibility,
} from "./multi-provider-payment-eligibility.js";

import {
  prepareMultiProviderRefundPolicies,
  type MultiProviderRefundRolloutSnapshot,
} from "./multi-provider-refund-preparation.js";

import {
  prepareMultiProviderBookingAgreements,
} from "./multi-provider-agreement-preparation.js";

import {
  readMultiProviderOccupancy,
} from "./multi-provider-occupancy-reader.js";

import {
  prepareMultiProviderAvailability,
} from "./multi-provider-availability-preparation.js";

import type {
  MultiProviderSubmissionEnvelope,
} from "./multi-provider-submission-contract.js";

import type {
  ProviderAvailabilityRequest,
} from "../provider-availability/validate-provider-availability.js";

type RequestType = "catering" | "addon";

type TrustedRequest = {
  type: RequestType;
  services: ProviderAvailabilityRequest["services"];
};

type Input = {
  transaction: Transaction;
  firestore: Firestore;
  customerId: string;
  bookingId: string;
  envelope: MultiProviderSubmissionEnvelope;
  submissionTime: Date;

  // The caller must read this authority inside the same
  // transaction before invoking this bridge.
  loadRefundRollout: (
    transaction: Transaction,
  ) => Promise<MultiProviderRefundRolloutSnapshot>;

  // Server-side classification only. Never use a client-supplied
  // request type or client-supplied service price.
  classifyTrustedRequest: (
    row: TrustedMultiProviderPackage,
  ) => TrustedRequest;
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

function requestId(
  bookingId: string,
  type: RequestType,
  providerId: string,
): string {
  return createHash("sha256")
    .update(`${bookingId}:${type}:${providerId}`)
    .digest("hex")
    .slice(0, 40);
}

/**
 * Authoritative, read-only Task 3 preparation.
 *
 * Every Firestore read is performed through the supplied
 * transaction. No transaction writes occur here.
 *
 * Caller responsibilities:
 * - authenticate and authorize the customer
 * - enforce maintenance and occasion publication admission
 * - read the canonical refund rollout
 * - classify request types using trusted provider/package data
 * - prepare FEASTA-compatible documents after this succeeds
 * - validate acknowledgements through the transaction coordinator
 */
export async function prepareTrustedMultiProviderSubmission(
  input: Input,
) {
  const {
    transaction,
    firestore,
    customerId,
    bookingId,
    envelope,
    submissionTime,
    loadRefundRollout,
    classifyTrustedRequest,
  } = input;

  if (
    !transaction ||
    typeof transaction.get !== "function" ||
    !firestore ||
    typeof firestore.collection !== "function" ||
    typeof customerId !== "string" ||
    !/^[A-Za-z0-9_-]{2,160}$/.test(customerId) ||
    typeof bookingId !== "string" ||
    !/^[a-f0-9]{40}$/.test(bookingId) ||
    !envelope ||
    envelope.schemaVersion !== 1 ||
    !Array.isArray(envelope.selections) ||
    envelope.selections.length < 2 ||
    envelope.selections.length > 4 ||
    !(submissionTime instanceof Date) ||
    !Number.isFinite(submissionTime.getTime()) ||
    typeof loadRefundRollout !== "function" ||
    typeof classifyTrustedRequest !== "function"
  ) {
    return reject("Multi-provider authoritative input is invalid.");
  }

  const event = envelope.event;

  const dateText = event?.eventDate;
  const eventTime = event?.eventTime;
  const eventEndTime = event?.eventEndTime;
  const guestCount = event?.guestCount;

  if (
    typeof dateText !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateText) ||
    typeof eventTime !== "string" ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(eventTime) ||
    typeof eventEndTime !== "string" ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(eventEndTime) ||
    !Number.isSafeInteger(guestCount) ||
    typeof guestCount !== "number" ||
    guestCount < 1 ||
    guestCount > 10000
  ) {
    return reject("Shared event information is invalid.");
  }

  const eventDate = new Date(`${dateText}T00:00:00+08:00`);

  if (
    !Number.isFinite(eventDate.getTime()) ||
    new Date(`${dateText}T00:00:00Z`)
      .toISOString().slice(0, 10) !== dateText
  ) {
    return reject("Shared event date is invalid.");
  }

  const rows = await readTrustedMultiProviderPackages({
    transaction,
    firestore,
    envelope,
  });

  if (rows.length !== envelope.selections.length) {
    return reject("Trusted package inventory is incomplete.");
  }

  const entries = rows.map((row) => ({
    providerId: row.providerId,
    packageId: row.resolved.packageId,
    packageData: row.packageData,
    resolved: row.resolved,
  }));

  const financials = prepareMultiProviderFinancials(entries);

  const eligibility = await prepareMultiProviderPaymentEligibility({
    transaction,
    entries,
    financials,
    eventDate,
    eventTime,
    submissionTime,
  });

  const rollout = await loadRefundRollout(transaction);

  const refunds = prepareMultiProviderRefundPolicies({
    rows,
    rollout,
  });

  const agreements = prepareMultiProviderBookingAgreements({
    customerId,
    rows,
    financials,
    eligibility,
    refunds,
    guestCount,
    eventEndTime,
  });

  const requests = rows.map((row) => {
    const classified = classifyTrustedRequest(row);

    if (
      !classified ||
      (classified.type !== "catering" &&
        classified.type !== "addon")
    ) {
      return reject("Trusted provider request type is invalid.");
    }

    return {
      providerId: row.providerId,
      providerRequestId: requestId(
        bookingId,
        classified.type,
        row.providerId,
      ),
      type: classified.type,
      services: classified.services,
      providerData: row.providerData,
    };
  });

  const occupancy = await readMultiProviderOccupancy({
    transaction,
    firestore,
    selections: requests.map((request) => ({
      providerId: request.providerId,
      providerRequestId: request.providerRequestId,
      eventDate,
    })),
  });

  const availability = prepareMultiProviderAvailability({
    now: submissionTime,
    candidates: requests.map((request) => {
      const existingBookings = occupancy.get(request.providerId);

      if (!existingBookings) {
        return reject("Provider occupancy evidence is incomplete.");
      }

      return {
        providerId: request.providerId,
        providerData: request.providerData,
        request: {
          providerRequestId: request.providerRequestId,
          type: request.type,
          eventDate,
          eventTime,
          eventEndTime,
          guestCount,
          services: request.services,
        },
        existingBookings,
      };
    }),
  });

  return {
    eventDate,
    eventTime,
    eventEndTime,
    guestCount,
    rows,
    financials,
    eligibility,
    refunds,
    agreements,
    requests,
    occupancy,
    availability,
  };
}