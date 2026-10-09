import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {USER_ROLES} from "../shared/constants.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {prepareFailedProviderDisbursementRetry} from "./provider-disbursement-execution.js";
export const retryFailedProviderDisbursement = onCall(appCheckCallableOptions, async request => {
  const actor = requireAuth(request);
  await requireRole(actor.uid, [USER_ROLES.admin]);
  await enforceCallableRateLimit(request, {scope: "retryFailedProviderDisbursement", limit: 20, windowSeconds: 3600});
  const id = request.data?.providerDisbursementId;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,220}$/u.test(id) ||
      Object.keys(request.data).some(key => key !== "providerDisbursementId")) {
    throw new HttpsError("invalid-argument", "Only the disbursement identity may be supplied.");
  }
  try {await prepareFailedProviderDisbursementRetry(id, actor.uid);}
  catch {throw new HttpsError("failed-precondition", "Only an authoritatively failed payout can be retried.");}
  return {prepared: true};
});
