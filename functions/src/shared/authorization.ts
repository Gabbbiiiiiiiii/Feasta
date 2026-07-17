import {HttpsError} from "firebase-functions/v2/https";

import type {UserRole} from "./constants.js";
import {db} from "./firestore.js";

interface UserDocument {
  role?: UserRole;
  accountStatus?: string;
  isActive?: boolean;
  isBlocked?: boolean;
}

export async function getUserRole(
  uid: string,
): Promise<UserRole> {
  const snapshot = await db
    .collection("users")
    .doc(uid)
    .get();

  if (!snapshot.exists) {
    throw new HttpsError(
      "permission-denied",
      "User profile was not found.",
    );
  }

  const data = snapshot.data() as UserDocument;

  if (
    data.role !== "customer" &&
    data.role !== "provider" &&
    data.role !== "admin"
  ) {
    throw new HttpsError(
      "permission-denied",
      "The account has no valid role.",
    );
  }

  return data.role;
}

export async function requireActiveUser(
  uid: string,
): Promise<UserDocument> {
  const snapshot = await db
    .collection("users")
    .doc(uid)
    .get();

  if (!snapshot.exists) {
    throw new HttpsError(
      "permission-denied",
      "User profile was not found.",
    );
  }

  const data = snapshot.data() as UserDocument;

  const inactive =
    data.accountStatus !== "active" ||
    data.isActive === false ||
    data.isBlocked === true;

  if (inactive) {
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
    throw new HttpsError(
      "permission-denied",
      "The account has no valid role.",
    );
  }

  if (!allowedRoles.includes(user.role)) {
    throw new HttpsError(
      "permission-denied",
      "You are not authorized to perform this action.",
    );
  }

  return user.role;
}