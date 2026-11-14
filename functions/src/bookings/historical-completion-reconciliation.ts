import {HttpsError, onCall} from "firebase-functions/v2/https";

import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {logSecurityEvent} from "../shared/security-events.js";
import {requireObject, requireString} from "../shared/validation.js";
import {executeProviderBookingLifecycle} from "../provider-requests/update-provider-booking-lifecycle.js";
import {HISTORICAL_COMPLETION_ACKNOWLEDGEMENT} from "./historical-completion-domain.js";

const INPUT_FIELDS: readonly string[] = ["providerRequestId", "mainEventId", "acknowledgement", "reason"];

/*
 * Admin decision to complete a canonical, fully paid V3 booking whose original
 * financial snapshot predates provider disbursement enrollment. The booking
 * keeps its original terms: no enrollment is backfilled and no provider
 * disbursement is scheduled. All completion safety checks are re-validated
 * server-side in the lifecycle transaction.
 */
export const reconcileHistoricalBookingCompletion = onCall(
  {...appCheckCallableOptions, timeoutSeconds: 30},
  async (request) => {
    const actor = requireAuth(request);
    await requireRole(actor.uid, [USER_ROLES.admin]);
    await enforceCallableRateLimit(request, {
      scope: "bookings.historicalCompletionReconciliation",
      limit: 6,
      windowSeconds: 60 * 60,
    });

    const input = requireObject(request.data);
    if (Object.keys(input).some((key) => !INPUT_FIELDS.includes(key))) {
      throw new HttpsError("invalid-argument", "Only the booking identity, acknowledgement, and reason may be supplied.");
    }
    const providerRequestId = requireString(input.providerRequestId, "providerRequestId", {minLength: 8, maxLength: 160});
    const mainEventId = requireString(input.mainEventId, "mainEventId", {minLength: 8, maxLength: 160});
    if (input.acknowledgement !== HISTORICAL_COMPLETION_ACKNOWLEDGEMENT) {
      throw new HttpsError("invalid-argument",
        "The decision must acknowledge completion without provider disbursement enrollment.");
    }
    const reason = requireString(input.reason, "reason", {minLength: 20, maxLength: 1000});

    try {
      return await executeProviderBookingLifecycle(providerRequestId, "completed",
        {kind: "historical_reconciliation", uid: actor.uid, reason, mainEventId});
    } catch (error) {
      logSecurityEvent({
        action: "provider_booking_lifecycle",
        outcome: "denied",
        actorUid: actor.uid,
        targetId: providerRequestId,
        reasonCode: "historical_completion_reconciliation_rejected",
        metadata: {mainEventId, code: error instanceof HttpsError ? error.code : "internal"},
      });
      throw error;
    }
  },
);
