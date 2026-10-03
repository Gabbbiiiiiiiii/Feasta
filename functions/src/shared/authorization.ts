import {HttpsError} from "firebase-functions/v2/https";
import {getAuth} from "firebase-admin/auth";

import type {UserRole} from "./constants.js";
import {resolveBackendAccountState} from "./account-state.js";
import {db} from "./firestore.js";
import {logSecurityEvent} from "./security-events.js";

interface UserDocument {
  role?: UserRole;
  accountStatus?: string;
  isActive?: boolean;
  isBlocked?: boolean;
}

export async function getUserRole(
  uid: string,
): Promise<UserRole> {
  const snapshot = await db.collection("users").doc(uid).get();

  if (!snapshot.exists) {
    logSecurityEvent({
      action: "account_access_denied",
      outcome: "denied",
      actorUid: uid,
      targetId: uid,
      reasonCode: "profile_missing",
    });
    throw new HttpsError(
      "permission-denied",
      "User profile was not found.",
    );
  }

  const data = snapshot.data() as UserDocument;
  const state = resolveBackendAccountState({
    authDisabled: false,
    profile: data,
  });
  if (!state.role) {
    throw new HttpsError(
      "permission-denied",
      "The account has no valid role.",
    );
  }

  return state.role;
}

export async function requireActiveUser(
  uid: string,
): Promise<UserDocument> {
  const [snapshot, authUser] = await Promise.all([
    db.collection("users").doc(uid).get(),
    getAuth().getUser(uid),
  ]);

  if (!snapshot.exists) {
    logSecurityEvent({
      action: "account_access_denied",
      outcome: "denied",
      actorUid: uid,
      targetId: uid,
      reasonCode: "profile_missing",
    });
    throw new HttpsError(
      "permission-denied",
      "User profile was not found.",
    );
  }

  const data = snapshot.data() as UserDocument;
  const state = resolveBackendAccountState({
    authDisabled: authUser.disabled,
    profile: data,
  });

  if (state.kind !== "active") {
    logSecurityEvent({
      action: "account_access_denied",
      outcome: "denied",
      actorUid: uid,
      targetId: uid,
      reasonCode: accountStateReasonCode(state.kind),
    });
    throw new HttpsError(
      "permission-denied",
      "This account is not active.",
    );
  }

  return data;
}

export async function requireRole(
  uid: string,
  allowedRoles: readonly UserRole[],
): Promise<UserRole> {
  const user = await requireActiveUser(uid);

  if (
    user.role !== "customer" &&
    user.role !== "provider" &&
    user.role !== "admin"
  ) {
    logSecurityEvent({
      action: "role_access_denied",
      outcome: "denied",
      actorUid: uid,
      targetId: uid,
      reasonCode: "invalid_role",
    });
    throw new HttpsError(
      "permission-denied",
      "The account has no valid role.",
    );
  }

  if (!allowedRoles.includes(user.role)) {
    logSecurityEvent({
      action: "role_access_denied",
      outcome: "denied",
      actorUid: uid,
      targetId: uid,
      reasonCode: "role_not_allowed",
      metadata: {actualRole: user.role, allowedRoles},
    });
    throw new HttpsError(
      "permission-denied",
      "You are not authorized to perform this action.",
    );
  }

  return user.role;
}

function accountStateReasonCode(kind: string): string {
  switch (kind) {
  case "disabledAuthAccount": return "auth_disabled";
  case "blocked": return "account_blocked";
  case "deactivated": return "account_deactivated";
  case "missingUserProfile": return "profile_missing";
  case "forbiddenRole": return "invalid_role";
  case "invalidAccountState": return "invalid_account_state";
  default: return "account_inactive";
  }
}
