import {getAuth} from "firebase-admin/auth";
import {HttpsError, onCall, type CallableRequest} from "firebase-functions/v2/https";
import {requireAuth} from "../shared/auth.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {db} from "../shared/firestore.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {mutateAuthorizedEventList} from "./mutate-event-list.js";

/** Exported only for focused transport tests. UID always comes from verified auth. */
export async function handleCustomerEventListMutation(request: CallableRequest<unknown>) {
  const {uid} = requireAuth(request);
  // Reject disabled users and tokens predating revocation, beyond profile checks.
  const user = await getAuth().getUser(uid);
  const authTime = request.auth?.token.auth_time;
  const validAfter = Date.parse(user.tokensValidAfterTime ?? "");
  if (user.disabled || typeof authTime !== "number" || !Number.isFinite(validAfter) ||
      authTime * 1000 < validAfter) {
    throw new HttpsError("permission-denied", "Your customer session is no longer active.");
  }
  await enforceCallableRateLimit(request,
    {scope: "customer-event-list-mutation", limit: 120, windowSeconds: 60});
  return mutateAuthorizedEventList(db, uid, request.data);
}
export const mutateCustomerEventList = onCall(
  {
    ...appCheckCallableOptions,
    preserveExternalChanges: true,
    memory: "256MiB",
    concurrency: 80,
    timeoutSeconds: 60,
  },
  handleCustomerEventListMutation,
);
