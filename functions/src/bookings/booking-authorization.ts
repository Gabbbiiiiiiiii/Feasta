import {HttpsError} from "firebase-functions/v2/https";

export interface BookingAccountState {
  role?: unknown;
  accountStatus?: unknown;
  isActive?: unknown;
  isBlocked?: unknown;
  isPhoneVerified?: unknown;
  phoneNumber?: unknown;
}

export function assertBookingSubmissionAllowed(
  user: BookingAccountState,
  emailVerified: boolean,
  authPhoneNumber: string | undefined,
): void {
  if (
    user.role !== "customer" ||
    user.accountStatus !== "active" ||
    user.isActive !== true ||
    user.isBlocked === true
  ) {
    throw new HttpsError("permission-denied", "Account is unavailable.");
  }
  if (!emailVerified) {
    throw new HttpsError(
      "failed-precondition",
      "Email verification is required.",
    );
  }
  if (
    user.isPhoneVerified !== true ||
    typeof user.phoneNumber !== "string" ||
    !/^\+639\d{9}$/u.test(user.phoneNumber) ||
    authPhoneNumber !== user.phoneNumber
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Phone verification is required.",
    );
  }
}
