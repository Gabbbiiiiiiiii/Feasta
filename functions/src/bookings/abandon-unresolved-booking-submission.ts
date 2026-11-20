import {onCall, HttpsError} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {db} from "../shared/firestore.js";
import {
  abandonUnresolvedSubmissionInTransaction,
  bookingOutcomeId,
  reconcileSubmissionOutcome,
} from "./submission-outcome.js";

export const abandonUnresolvedBookingSubmission = onCall(
  {...appCheckCallableOptions, timeoutSeconds: 30}, async request => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, ["customer"]);
    await enforceCallableRateLimit(request, {
      scope: "bookings.abandonUnresolved",
      limit: 10,
      windowSeconds: 600,
    });
    const input = request.data;
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).join() !== "clientRequestId" || typeof input.clientRequestId !== "string" ||
        !/^[A-Za-z0-9_-]{8,160}$/.test(input.clientRequestId)) {
      throw new HttpsError("invalid-argument", "Original request identifier is required.");
    }
    const requestId = input.clientRequestId;
    const id = bookingOutcomeId(actor.uid, requestId);
    const bookingRef = db.collection("mainEvents").doc(id);
    const receiptRef = db.collection("bookingSubmissionOutcomes").doc(id);
    return db.runTransaction(async tx => {
      const [booking, receipt] = await Promise.all([tx.get(bookingRef), tx.get(receiptRef)]);
      const reconciled = reconcileSubmissionOutcome(
        actor.uid, requestId, id, booking.data(), receipt.data(),
      );
      if (reconciled.outcome === "confirmed_created" || reconciled.outcome === "confirmed_rejected") {
        return {clientRequestId: requestId, ...reconciled};
      }
      // Malformed, foreign, or contradictory evidence stays locked for support.
      if (booking.exists || receipt.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Previous request still requires administrative reconciliation.",
          {reason: "SUBMISSION_UNRESOLVED_LOCKED"},
        );
      }
      abandonUnresolvedSubmissionInTransaction(tx, receiptRef, actor.uid, requestId);
      return {clientRequestId: requestId, outcome: "confirmed_rejected" as const};
    });
  },
);
