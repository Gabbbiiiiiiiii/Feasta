import {getAuth} from "firebase-admin/auth";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  requireAuth,
} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {
  db,
} from "../shared/firestore.js";
import {
  appCheckCallableOptions,
} from "../shared/function-options.js";
import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";
import {
  logSecurityEvent,
} from "../shared/security-events.js";
import {
  requirePhoneAvailableToUid,
} from "../shared/phone-identity.js";
import {
  requireObject,
  requirePhilippineMobile,
} from "../shared/validation.js";

export const prepareCustomerPhoneVerification =
  onCall(
    appCheckCallableOptions,
    async (request) => {
      const actor =
        requireAuth(request);

      await requireRole(
        actor.uid,
        ["customer"],
      );

      await enforceCallableRateLimit(
        request,
        {
          scope:
            "auth.prepareCustomerPhoneVerification",
          limit: 5,
          windowSeconds: 60 * 60,
        },
      );

      const input =
        requireObject(request.data);

      rejectUnknownFields(
        input,
        ["phoneNumber"],
      );

      const authUser =
        await getAuth().getUser(
          actor.uid,
        );

      if (!authUser.emailVerified) {
        throw new HttpsError(
          "failed-precondition",
          "Verify your email before verifying your mobile number.",
        );
      }

      const userReference =
        db
          .collection("users")
          .doc(actor.uid);

      const customerReference =
        db
          .collection("customers")
          .doc(actor.uid);

      const requestedPhone =
        input.phoneNumber ===
        undefined
          ? null
          : requirePhilippineMobile(
              input.phoneNumber,
            );

      const [userSnapshot, customerSnapshot] =
        await Promise.all([
          userReference.get(),
          customerReference.get(),
        ]);
      const user = userSnapshot.data();
      if (!userSnapshot.exists || user?.role !== "customer") {
        throw new HttpsError(
          "not-found",
          "Customer account was not found.",
        );
      }
      if (!customerSnapshot.exists) {
        throw new HttpsError(
          "not-found",
          "Customer profile was not found.",
        );
      }
      const currentPhone =
        typeof user.phoneNumber === "string" ? user.phoneNumber : "";
      const normalizedCurrentPhone = currentPhone ?
        requirePhilippineMobile(currentPhone) :
        null;
      if (
        requestedPhone &&
        normalizedCurrentPhone &&
        requestedPhone === normalizedCurrentPhone
      ) {
        throw new HttpsError(
          "already-exists",
          "This is already your current mobile number. " +
            "Enter a different mobile number to continue.",
        );
      }
      const phoneNumber = requestedPhone ??
        requirePhilippineMobile(currentPhone);
      await requirePhoneAvailableToUid(actor.uid, phoneNumber);

      logSecurityEvent({
        action:
          "customer_phone_verification_prepared",
        outcome: "allowed",
        actorUid: actor.uid,
        targetId: actor.uid,
        metadata: {
          replacement:
            requestedPhone !== null,
        },
      });

      return {
        phoneNumber,
      };
    },
  );

function rejectUnknownFields(
  input:
    Record<string, unknown>,
  allowedFields:
    readonly string[],
): void {
  const unknownFields =
    Object.keys(input).filter(
      (field) =>
        !allowedFields.includes(
          field,
        ),
    );

  if (
    unknownFields.length > 0
  ) {
    throw new HttpsError(
      "invalid-argument",
      `Unknown phone verification fields: ${unknownFields.join(
        ", ",
      )}.`,
    );
  }
}
