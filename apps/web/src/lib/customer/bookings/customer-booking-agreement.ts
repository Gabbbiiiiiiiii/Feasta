"use client";

import {
  httpsCallable,
} from "firebase/functions";

import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

import type {
  SubmitBookingRequestInput,
} from "./customer-booking-submission-client";

export type BookingAgreementDisclosure = {
  schemaVersion: 1;
  timingSchemaVersion: 3;

  agreementKey: string;

  providerId: string;
  providerName: string;

  serviceNames: string[];
  serviceTierLabel: string | null;

  eventStartAt: string;

  depositEligibilityCutoffAt: string;
  remainingBalanceDueAt: string;
  hardPaymentDeadlineAt: string;
  preparationStartsAt: string;

  grossAmountInCentavos: number;

  requiredUpfrontAmountInCentavos:
    number;

  remainingBalanceInCentavos:
    number;

  depositEligible: boolean;

  eligibilityReason?: string;

  paymentDefaultAllocation:
    | null
    | {
        customerDefaultRefundAmountInCentavos:
          number;

        providerReservationCompAmountInCentavos:
          number;

        feastaCancellationFeeAmountInCentavos:
          number;
      };
};

export type BookingAgreementAcknowledgement =
  {
    providerId: string;
    agreementKey: string;
  };

const DISCLOSURE_FIELDS =
  new Set([
    "schemaVersion",
    "timingSchemaVersion",
    "agreementKey",

    "providerId",
    "providerName",

    "serviceNames",
    "serviceTierLabel",

    "eventStartAt",

    "depositEligibilityCutoffAt",
    "remainingBalanceDueAt",
    "hardPaymentDeadlineAt",
    "preparationStartsAt",

    "grossAmountInCentavos",
    "requiredUpfrontAmountInCentavos",
    "remainingBalanceInCentavos",

    "depositEligible",
    "eligibilityReason",

    "paymentDefaultAllocation",
  ]);

export async function getCustomerBookingPaymentAgreements(
  input:
    SubmitBookingRequestInput,
): Promise<
  BookingAgreementDisclosure[]
> {
  await auth.authStateReady();

  if (!auth.currentUser) {
    throw new Error(
      "Sign in to review your booking agreement.",
    );
  }

  initializeBrowserAppCheck();

  const callable =
    httpsCallable<
      SubmitBookingRequestInput,
      {agreements: unknown}
    >(
      functions,
      "getBookingPaymentAgreementDisclosures",
      {
        timeout: 30_000,
      },
    );

  return parseBookingPaymentAgreements(
    (
      await callable(input)
    ).data.agreements,
  );
}

export function parseBookingPaymentAgreements(
  value: unknown,
): BookingAgreementDisclosure[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 21
  ) {
    throw new Error(
      "Booking agreement is unavailable.",
    );
  }

  const seen =
    new Set<string>();

  return value.map(
    (item) => {
      if (
        !item ||
        typeof item !== "object" ||
        Array.isArray(item) ||
        item.schemaVersion !== 1 ||
        item.timingSchemaVersion !==
          3 ||
        !/^[a-f0-9]{64}$/u.test(
          item.agreementKey,
        ) ||
        typeof item.providerId !==
          "string" ||
        seen.has(
          item.providerId,
        ) ||
        typeof item.providerName !==
          "string" ||
        typeof item.depositEligible !==
          "boolean"
      ) {
        throw new Error(
          "Booking agreement is invalid.",
        );
      }

      if (
        Object.keys(item).some(
          (key) =>
            !DISCLOSURE_FIELDS.has(
              key,
            ),
        )
      ) {
        throw new Error(
          "Booking agreement contains unexpected data.",
        );
      }

      if (
        !Array.isArray(
          item.serviceNames,
        ) ||
        item.serviceNames.length <
          1 ||
        item.serviceNames.length >
          32 ||
        item.serviceNames.some(
          (name: unknown) =>
            typeof name !==
              "string" ||
            name.trim().length <
              1 ||
            name.length > 200,
        )
      ) {
        throw new Error(
          "Booking agreement services are invalid.",
        );
      }

      if (
        item.serviceTierLabel !==
          null &&
        (typeof item.serviceTierLabel !==
          "string" ||
          item.serviceTierLabel
            .trim()
            .length < 1 ||
          item.serviceTierLabel
            .length > 200)
      ) {
        throw new Error(
          "Booking agreement service level is invalid.",
        );
      }

      seen.add(
        item.providerId,
      );

      for (const field of [
        "grossAmountInCentavos",
        "requiredUpfrontAmountInCentavos",
        "remainingBalanceInCentavos",
      ]) {
        if (
          !Number.isSafeInteger(
            item[field],
          ) ||
          item[field] < 0
        ) {
          throw new Error(
            "Booking agreement amounts are invalid.",
          );
        }
      }

      if (
        item.requiredUpfrontAmountInCentavos +
          item.remainingBalanceInCentavos !==
        item.grossAmountInCentavos
      ) {
        throw new Error(
          "Booking agreement totals are invalid.",
        );
      }

      const event =
        Date.parse(
          item.eventStartAt,
        );

      for (
        const [
          field,
          hours,
        ] of [
          [
            "depositEligibilityCutoffAt",
            72,
          ],
          [
            "remainingBalanceDueAt",
            48,
          ],
          [
            "hardPaymentDeadlineAt",
            24,
          ],
          [
            "preparationStartsAt",
            24,
          ],
        ] as const
      ) {
        if (
          !Number.isFinite(event) ||
          Date.parse(
            item[field],
          ) !==
            event -
              hours *
                3_600_000
        ) {
          throw new Error(
            "Booking agreement timing is invalid.",
          );
        }
      }

      const allocation =
        item.paymentDefaultAllocation;

      if (
        item.depositEligible
      ) {
        const deposit =
          item.requiredUpfrontAmountInCentavos;

        if (
          !allocation ||
          allocation.customerDefaultRefundAmountInCentavos !==
            Math.floor(
              deposit * 0.7,
            ) ||
          allocation.providerReservationCompAmountInCentavos !==
            Math.floor(
              deposit * 0.2,
            ) ||
          allocation.feastaCancellationFeeAmountInCentavos !==
            deposit -
              allocation.customerDefaultRefundAmountInCentavos -
              allocation.providerReservationCompAmountInCentavos
        ) {
          throw new Error(
            "Booking agreement allocation is invalid.",
          );
        }
      } else if (
        allocation !== null ||
        item.remainingBalanceInCentavos !==
          0
      ) {
        throw new Error(
          "Booking agreement payment terms are invalid.",
        );
      }

      return item as
        BookingAgreementDisclosure;
    },
  );
}