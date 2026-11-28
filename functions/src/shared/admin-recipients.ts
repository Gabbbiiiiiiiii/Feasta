import {HttpsError} from "firebase-functions/v2/https";

import {USER_ROLES} from "./constants.js";
import {db} from "./firestore.js";

const ADMIN_RECIPIENT_LIMIT = 100;

/**
 * Bounded active-admin recipient list for server-authored notifications.
 * Never accept client-supplied admin IDs.
 */
export async function listActiveAdminUserIds(): Promise<string[]> {
  const administrators = await db
    .collection("users")
    .where("role", "==", USER_ROLES.admin)
    .limit(ADMIN_RECIPIENT_LIMIT + 1)
    .get();

  if (administrators.size > ADMIN_RECIPIENT_LIMIT) {
    throw new HttpsError(
      "resource-exhausted",
      "The administrator recipient list exceeds the supported limit.",
    );
  }

  return administrators.docs
    .filter((doc) => {
      const data = doc.data();
      return (
        data.role === USER_ROLES.admin &&
        data.accountStatus === "active" &&
        data.isActive !== false &&
        data.isBlocked !== true &&
        data.isDeleted !== true
      );
    })
    .map((doc) => doc.id);
}
