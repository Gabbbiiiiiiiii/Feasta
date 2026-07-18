import {HttpsError, onCall} from "firebase-functions/v2/https";

import {writeAuditLogInTransaction} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {db} from "../shared/firestore.js";
import {
  createIdempotencyKey,
  executeIdempotently,
} from "../shared/idempotency.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {requireObject, requireString} from "../shared/validation.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {requireActiveUser} from "../shared/authorization.js";

export const createComplaint = onCall(
  appCheckCallableOptions,
  async (request) => {
    const user = requireAuth(request);
    await requireActiveUser(user.uid);
    await enforceCallableRateLimit(request, {
      scope: "createComplaint",
      limit: 3,
      windowSeconds: 60 * 60,
    });
    const input = requireObject(request.data);
    const description = requireString(input.description, "description", {
      minLength: 10,
      maxLength: 4000,
    });
    const category = typeof input.category === "string" ?
      input.category.trim().slice(0, 80) : "general";
    const providerId = typeof input.providerId === "string" ?
      input.providerId.trim() : "";
    if (providerId.length > 128) {
      throw new HttpsError("invalid-argument", "providerId is invalid.");
    }

    const key = createIdempotencyKey({
      operation: "createComplaint",
      actorId: user.uid,
      clientKey: input.idempotencyKey,
      payload: {description, category, providerId},
    });
    const complaintId = `complaint_${key.slice(0, 32)}`;
    const execution = await executeIdempotently({
      key,
      operation: "createComplaint",
      actorId: user.uid,
      handler: async () => db.runTransaction(async (transaction) => {
        const reference = db.collection("complaints").doc(complaintId);
        const existing = await transaction.get(reference);
        if (existing.exists) return {complaintId, created: false};

        transaction.create(reference, {
          userId: user.uid,
          providerId: providerId || null,
          category,
          description,
          evidenceUrls: [],
          status: "submitted",
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          deletionReason: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        writeAuditLogInTransaction(transaction, {
          actorId: user.uid,
          actorRole: "user",
          action: "complaint_created",
          targetCollection: "complaints",
          targetId: complaintId,
          source: "cloud_function",
          before: null,
          after: {status: "submitted"},
          metadata: {providerId: providerId || null, category},
        });
        return {complaintId, created: true};
      }),
    });

    return {
      success: true,
      ...execution.result,
      idempotentReplay: execution.replayed,
    };
  },
);
