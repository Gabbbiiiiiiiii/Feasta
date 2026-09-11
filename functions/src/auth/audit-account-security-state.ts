import {onDocumentUpdatedWithAuthContext} from "firebase-functions/v2/firestore";

import {db} from "../shared/firestore.js";
import {
  accountSecurityAction,
  logSecurityEvent,
} from "../shared/security-events.js";
import {serverTimestamp} from "../shared/timestamps.js";
import {shouldPublishProvider} from "../shared/constants.js";

export const onUserSecurityStateChanged = onDocumentUpdatedWithAuthContext(
  {
    document: "users/{userId}",
    region: "asia-southeast1",
  },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after) return;

    const blockedChanged = before.isBlocked !== after.isBlocked;
    const statusChanged = before.accountStatus !== after.accountStatus;
    const activeChanged = before.isActive !== after.isActive;
    if (!blockedChanged && !statusChanged && !activeChanged) return;

    const targetId = event.params.userId;
    const actorUid = event.authId ?? `principal:${event.authType}`;
    const action = accountSecurityAction(
      before.isBlocked === true,
      after.isBlocked === true,
    );
    const reference = db.collection("adminLogs").doc(`security_${event.id}`);

    await db.runTransaction(async (transaction) => {
      const auditSnapshot = await transaction.get(reference);
      if (auditSnapshot.exists) return;
      const providerId =
        after.role === "provider" && typeof after.providerId === "string"
          ? after.providerId
          : null;
      const providerReference = providerId
        ? db.collection("providers").doc(providerId)
        : null;
      const providerSnapshot = providerReference
        ? await transaction.get(providerReference)
        : null;
      const packageSnapshot = providerId
        ? await transaction.get(
            db.collection("packages")
              .where("providerId", "==", providerId)
              .limit(100),
          )
        : null;
      transaction.create(reference, {
        actorId: actorUid,
        actorRole: event.authType,
        action,
        targetCollection: "users",
        targetId,
        source: "firestore_auth_context_trigger",
        before: {
          isBlocked: before.isBlocked ?? null,
          isActive: before.isActive ?? null,
          accountStatus: before.accountStatus ?? null,
        },
        after: {
          isBlocked: after.isBlocked ?? null,
          isActive: after.isActive ?? null,
          accountStatus: after.accountStatus ?? null,
        },
        metadata: {eventId: event.id},
        createdAt: serverTimestamp(),
      });
      if (providerReference && providerSnapshot?.exists) {
        const publiclyVisible = shouldPublishProvider(
          {
            ...(providerSnapshot.data() ?? {}),
            id: providerReference.id,
          },
          after,
        );
        transaction.update(providerReference, {
          publiclyVisible,
          updatedAt: serverTimestamp(),
        });
        for (const packageDocument of packageSnapshot?.docs ?? []) {
          const packageData = packageDocument.data();
          transaction.update(packageDocument.ref, {
            providerPubliclyVisible:
              publiclyVisible &&
              packageData.status === "published" &&
              packageData.isActive === true &&
              packageData.isPublished === true &&
              packageData.isDeleted !== true,
            updatedAt: serverTimestamp(),
          });
        }
      }
    });

    logSecurityEvent({
      action: "account_security_state_changed",
      outcome: "succeeded",
      actorUid,
      targetId,
      correlationId: event.id,
      reasonCode: action,
    });
  },
);
