import {onCall, HttpsError} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {db} from "../shared/firestore.js";
import {bookingOutcomeId, reconcileSubmissionOutcome} from "./submission-outcome.js";

export const reconcileBookingSubmission = onCall(
  {...appCheckCallableOptions, timeoutSeconds: 30}, async request => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, ["customer"]);
    await enforceCallableRateLimit(request, {scope: "bookings.reconcile", limit: 30, windowSeconds: 600});
    const input = request.data;
    if (!input || typeof input !== "object" || Array.isArray(input) ||
        Object.keys(input).join() !== "clientRequestId" || typeof input.clientRequestId !== "string" ||
        !/^[A-Za-z0-9_-]{8,160}$/.test(input.clientRequestId)) {
      throw new HttpsError("invalid-argument", "Original request identifier is required.");
    }
    const requestId = input.clientRequestId;
    const id = bookingOutcomeId(actor.uid, requestId);
    // Consistent snapshot, with no writes or receipt backfill.
    return db.runTransaction(async tx => {
      const [booking, receipt] = await Promise.all([
        tx.get(db.collection("mainEvents").doc(id)),
        tx.get(db.collection("bookingSubmissionOutcomes").doc(id)),
      ]);
      return {clientRequestId: requestId,
        ...reconcileSubmissionOutcome(actor.uid, requestId, id, booking.data(), receipt.data())};
    });
  },
);
