import {HttpsError} from "firebase-functions/v2/https";
import type {
  Firestore,
  Transaction,
} from "firebase-admin/firestore";

import {
  bookingOutcomeId,
  assertNoRejectedSubmission,
  rejectAcknowledgementInTransaction,
} from "./submission-outcome.js";

import {
  createMultiProviderBookingAtomically,
  type MultiProviderAtomicWritePlan,
} from "./multi-provider-atomic-write.js";

type PreparedSubmission = {
  plan: MultiProviderAtomicWritePlan;

  // These closures must call FEASTA's existing acknowledgement
  // validators against current, trusted transaction evidence.
  validateRefundAcknowledgements: () => void;
  validatePaymentAgreements: () => void;
};

type Input = {
  firestore: Firestore;
  customerId: string;
  clientRequestId: string;
  submissionFingerprint: string;

  // Auth, maintenance, occasion, packages, payments, refunds and
  // availability must be revalidated by the caller's trusted
  // preparation function inside this transaction.
  prepare: (
    transaction: Transaction,
    bookingId: string,
  ) => Promise<PreparedSubmission>;
};

type SubmissionResult = {
  bookingId: string;
  mainEventId: string;
  providerRequestIds: string[];
  created: boolean;
};

type TransactionResult =
  | {kind: "created" | "replayed"; result: SubmissionResult}
  | {kind: "rejected"; error: HttpsError};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_-]{8,160}$/.test(value);
}

function validRequestIds(value: unknown): value is string[] {
  return Array.isArray(value) &&
    value.length >= 2 &&
    value.length <= 4 &&
    new Set(value).size === value.length &&
    value.every((id) =>
      typeof id === "string" &&
      /^[a-f0-9]{40}$/.test(id)
    );
}

/**
 * Internal transaction kernel for Task 3.
 *
 * Not a callable endpoint. No customer-controlled financial
 * values or unvalidated package selections may enter the write
 * plan. The prepare callback is trusted server implementation.
 *
 * The callback must finish all transaction reads before any
 * writes are queued.
 */
export async function coordinateMultiProviderSubmission(
  input: Input,
): Promise<SubmissionResult> {
  if (
    !input ||
    !input.firestore ||
    typeof input.firestore.runTransaction !== "function" ||
    typeof input.firestore.collection !== "function" ||
    !validId(input.customerId) ||
    !validId(input.clientRequestId) ||
    typeof input.submissionFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.submissionFingerprint) ||
    typeof input.prepare !== "function"
  ) {
    return reject("Multi-provider transaction input is invalid.");
  }

  const {
    firestore,
    customerId,
    clientRequestId,
    submissionFingerprint,
    prepare,
  } = input;

  // Reuse FEASTA's existing deterministic booking identity.
  const bookingId = bookingOutcomeId(customerId, clientRequestId);

  const bookingReference = firestore
    .collection("mainEvents")
    .doc(bookingId);

  const outcomeReference = firestore
    .collection("bookingSubmissionOutcomes")
    .doc(bookingId);

  const transactionResult =
    await firestore.runTransaction(
      async (transaction): Promise<TransactionResult> => {
        // Read both records before any possible write.
        const [bookingSnapshot, outcomeSnapshot] =
          await Promise.all([
            transaction.get(bookingReference),
            transaction.get(outcomeReference),
          ]);

        if (bookingSnapshot.exists) {
          const existing = bookingSnapshot.data();

          if (
            !existing ||
            existing.customerId !== customerId ||
            existing.clientRequestId !== clientRequestId ||
            existing.mainEventId !== bookingId ||
            existing.bookingId !== bookingId ||
            typeof existing.submissionFingerprint !== "string" ||
            existing.submissionFingerprint !== submissionFingerprint ||
            !validRequestIds(existing.providerRequestIds) ||
            outcomeSnapshot.exists
          ) {
            if (
              existing?.customerId === customerId &&
              existing?.clientRequestId === clientRequestId &&
              typeof existing?.submissionFingerprint === "string" &&
              existing.submissionFingerprint !== submissionFingerprint
            ) {
              throw new HttpsError(
                "already-exists",
                "This request identifier was already used for another selection.",
              );
            }

            return reject(
              "Existing booking requires reconciliation.",
            );
          }

          // Existing successful submission: do not create again.
          return {
            kind: "replayed",
            result: {
              bookingId,
              mainEventId: bookingId,
              providerRequestIds: existing.providerRequestIds,
              created: false,
            },
          };
        }

        // Reuse FEASTA's terminal rejection rules.
        assertNoRejectedSubmission(
          outcomeSnapshot.data(),
          customerId,
          clientRequestId,
          submissionFingerprint,
        );

        // The trusted callback performs ALL fresh server-side
        // reads and validations and produces canonical documents.
        const prepared = await prepare(
          transaction,
          bookingId,
        );

        if (
          !prepared ||
          !prepared.plan ||
          typeof prepared.validateRefundAcknowledgements !==
            "function" ||
          typeof prepared.validatePaymentAgreements !==
            "function"
        ) {
          return reject(
            "Multi-provider preparation is incomplete.",
          );
        }

        const plan = prepared.plan;

        if (
          plan.customerId !== customerId ||
          plan.clientRequestId !== clientRequestId ||
          plan.submissionFingerprint !== submissionFingerprint ||
          plan.booking.reference.path !== bookingReference.path
        ) {
          return reject(
            "Prepared submission identity does not match.",
          );
        }

        const identity = {
          customerId,
          clientRequestId,
          submissionFingerprint,
        };

        // Crucial: do NOT throw inside the transaction for
        // recognized acknowledgement rejection errors.
        // That would roll back the terminal rejection receipt.
        const refundRejection =
          rejectAcknowledgementInTransaction(
            transaction,
            outcomeReference,
            identity,
            prepared.validateRefundAcknowledgements,
          );

        if (refundRejection) {
          return {
            kind: "rejected",
            error: refundRejection,
          };
        }

        const agreementRejection =
          rejectAcknowledgementInTransaction(
            transaction,
            outcomeReference,
            identity,
            prepared.validatePaymentAgreements,
          );

        if (agreementRejection) {
          return {
            kind: "rejected",
            error: agreementRejection,
          };
        }

        // This helper validates ALL parent/request identities
        // before queueing any create operations.
        createMultiProviderBookingAtomically(
          transaction,
          plan,
        );

        return {
          kind: "created",
          result: {
            bookingId,
            mainEventId: bookingId,
            providerRequestIds:
              plan.requests.map((item) => item.reference.id),
            created: true,
          },
        };
      },
    );

  // Rejection is thrown only AFTER the transaction commits
  // its terminal outcome record.
  if (transactionResult.kind === "rejected") {
    throw transactionResult.error;
  }

  return transactionResult.result;
}