import {
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase-admin/firestore";
import {HttpsError} from "firebase-functions/v2/https";

import {
  parseMainEventStatus,
  type MainEventStatus,
} from "../shared/constants.js";
import {
  manilaDateKey,
} from "../provider-availability/validate-provider-availability.js";
import type {
  AuthorizedProviderRequest,
} from "./provider-request-authorization.js";

const SAFE_DOCUMENT_ID =
  /^[A-Za-z0-9_-]{8,160}$/u;

const RESPONSE_PARENT_STATUSES =
  new Set<MainEventStatus>([
    "pending_provider_approval",
    "needs_provider_replacement",
  ]);

type CanonicalProviderRequestCore = {
  mainEventData: DocumentData;
  mainEventStatus: MainEventStatus;
};

export type AcceptanceProviderRequestSnapshot = {
  eventDate: Timestamp;
  eventTime: string;
  eventEndTime: string;
  guestCount: number;
  amount: number;
  downPaymentAmount: number;
  remainingBalance: number;
};

type ServiceSnapshot = {
  serviceId: string;
  name: string;
  category: string;
  price: number;
  downPaymentPercentage: number;
  downPaymentAmount: number;
};

type SelectedServiceSnapshot = {
  serviceId: string;
  providerId: string;
  name: string;
  category: string;
  price: number;
  downPaymentPercentage: number;
};

export function assertCanonicalProviderRequestCore(
  input: {
    authorized: AuthorizedProviderRequest;
    mainEventSnapshot:
      DocumentSnapshot<DocumentData>;
  },
): CanonicalProviderRequestCore {
  const {
    authorized,
    mainEventSnapshot,
  } = input;

  if (!mainEventSnapshot.exists) {
    throw new HttpsError(
      "not-found",
      "The main event was not found.",
    );
  }

  const mainEventData =
    mainEventSnapshot.data() ?? {};

  if (
    !SAFE_DOCUMENT_ID.test(
      authorized.providerRequestId,
    ) ||
    !SAFE_DOCUMENT_ID.test(
      authorized.mainEventId,
    ) ||
    mainEventSnapshot.id !==
      authorized.mainEventId ||
    requiredId(
      authorized.requestData,
      "providerRequestId",
    ) !== authorized.providerRequestId ||
    requiredId(
      authorized.requestData,
      "mainEventId",
    ) !== authorized.mainEventId ||
    requiredId(
      authorized.requestData,
      "bookingId",
    ) !== authorized.mainEventId ||
    requiredId(
      mainEventData,
      "mainEventId",
    ) !== authorized.mainEventId ||
    requiredId(
      mainEventData,
      "bookingId",
    ) !== authorized.mainEventId
  ) {
    throw invalidLinkage();
  }

  if (
    mainEventData.customerId !==
      authorized.customerId ||
    authorized.requestData.providerId !==
      authorized.providerId
  ) {
    throw invalidLinkage();
  }

  const providerRequestIds =
    mainEventData.providerRequestIds;

  if (
    !Array.isArray(providerRequestIds) ||
    !providerRequestIds.includes(
      authorized.providerRequestId,
    )
  ) {
    throw invalidLinkage();
  }

  const mainEventStatus =
    parseMainEventStatus(
      mainEventData.status,
    );

  if (!mainEventStatus) {
    throw new HttpsError(
      "failed-precondition",
      "The main-event status is invalid.",
    );
  }

  return {
    mainEventData,
    mainEventStatus,
  };
}

export function requireProviderResponseParentStatus(
  status: MainEventStatus,
): void {
  if (!RESPONSE_PARENT_STATUSES.has(status)) {
    throw new HttpsError(
      "failed-precondition",
      "This event cannot receive a new provider response.",
    );
  }
}

export function validateAcceptanceProviderRequest(
  input: {
    authorized: AuthorizedProviderRequest;
    mainEventData: DocumentData;
    now: Date;
  },
): AcceptanceProviderRequestSnapshot {
  const {
    authorized,
    mainEventData,
    now,
  } = input;
  const requestData =
    authorized.requestData;
  const eventDate =
    requestData.eventDate;
  const parentEventDate =
    mainEventData.eventDate;

  if (
    !(eventDate instanceof Timestamp) ||
    !(parentEventDate instanceof Timestamp) ||
    eventDate.toMillis() !==
      parentEventDate.toMillis()
  ) {
    throw snapshotMismatch(
      "event date",
    );
  }

  const eventTime = sharedText(
    requestData,
    mainEventData,
    "eventTime",
  );
  const eventEndTime = sharedText(
    requestData,
    mainEventData,
    "eventEndTime",
  );

  if (
    !isCanonicalTime(eventTime) ||
    !isCanonicalTime(eventEndTime) ||
    minutes(eventEndTime) <=
      minutes(eventTime)
  ) {
    throw snapshotMismatch(
      "event time",
    );
  }

  sharedText(
    requestData,
    mainEventData,
    "eventType",
  );
  sharedText(
    requestData,
    mainEventData,
    "eventLocation",
  );
  sharedText(
    requestData,
    mainEventData,
    "eventAddress",
  );

  const guestCount =
    positiveInteger(
      requestData.guestCount,
      "Provider-request guest count",
    );

  if (
    guestCount !==
      positiveInteger(
        mainEventData.guestCount,
        "Main-event guest count",
      )
  ) {
    throw snapshotMismatch(
      "guest count",
    );
  }

  assertEventHasNotStarted({
    eventDate,
    eventTime,
    now,
  });

  const services =
    providerRequestServices(
      requestData.services,
    );

  assertSelectedServiceLinkage({
    providerId:
      authorized.providerId,
    requestData,
    mainEventData,
    services,
  });

  const amount = money(
    requestData.amount,
    "Provider-request amount",
  );
  const downPaymentAmount = money(
    requestData.downPaymentAmount,
    "Provider-request down payment",
  );
  const remainingBalance = money(
    requestData.remainingBalance,
    "Provider-request remaining balance",
  );
  const serviceAmount = roundCurrency(
    services.reduce(
      (total, service) =>
        total + service.price,
      0,
    ),
  );
  const serviceDownPayment =
    roundCurrency(
      services.reduce(
        (total, service) =>
          total +
          service.downPaymentAmount,
        0,
      ),
    );

  if (
    !sameMoney(amount, serviceAmount) ||
    !sameMoney(
      downPaymentAmount,
      serviceDownPayment,
    ) ||
    !sameMoney(
      remainingBalance,
      roundCurrency(
        amount - downPaymentAmount,
      ),
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider-request financial snapshot is invalid.",
    );
  }

  const effectivePercentage =
    percentage(
      requestData.downPaymentPercentage,
      "Provider-request down-payment percentage",
    );
  const expectedPercentage =
    amount === 0 ?
      0 :
      roundCurrency(
        (downPaymentAmount / amount) *
          100,
      );

  if (
    !sameMoney(
      effectivePercentage,
      expectedPercentage,
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider-request financial snapshot is invalid.",
    );
  }

  if (
    optionalId(requestData.packageId) &&
    (
      !sameMoney(
        amount,
        money(
          mainEventData.totalAmount,
          "Main-event provider amount",
        ),
      ) ||
      !sameMoney(
        downPaymentAmount,
        money(
          mainEventData.downPaymentAmount,
          "Main-event provider down payment",
        ),
      ) ||
      !sameMoney(
        remainingBalance,
        money(
          mainEventData.remainingBalance,
          "Main-event provider remaining balance",
        ),
      ) ||
      !sameMoney(
        effectivePercentage,
        percentage(
          mainEventData.downPaymentPercentage,
          "Main-event provider down-payment percentage",
        ),
      )
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      "The provider-request financial snapshot is invalid.",
    );
  }

  return {
    eventDate,
    eventTime,
    eventEndTime,
    guestCount,
    amount,
    downPaymentAmount,
    remainingBalance,
  };
}

function assertSelectedServiceLinkage(
  input: {
    providerId: string;
    requestData: DocumentData;
    mainEventData: DocumentData;
    services: readonly ServiceSnapshot[];
  },
): void {
  const {
    providerId,
    requestData,
    mainEventData,
    services,
  } = input;
  const selectedServices =
    selectedServiceSnapshots(
      mainEventData.selectedAddOns,
    ).filter(
      (service) =>
        service.providerId === providerId,
    );
  const expectedServiceIds =
    new Set(
      selectedServices.map(
        (service) => service.serviceId,
      ),
    );
  const packageId =
    optionalId(requestData.packageId);
  const requestType =
    authorizedRequestType(requestData);

  if (
    !requestType ||
    (requestType === "catering" &&
      !packageId) ||
    (requestType === "addon" &&
      packageId)
  ) {
    throw invalidServiceLinkage();
  }

  if (packageId) {
    const parentPackageId =
      requiredId(
        mainEventData,
        "packageId",
      );
    const parentProviderId =
      optionalId(
        mainEventData.currentProviderId,
      ) ??
      optionalId(mainEventData.providerId);

    if (
      parentPackageId !== packageId ||
      parentProviderId !== providerId ||
      normalizedText(
        requestData.packageName,
      ) !==
        normalizedText(
          mainEventData.packageName,
        )
    ) {
      throw invalidServiceLinkage();
    }

    const packageService =
      services.find(
        (service) =>
          service.serviceId === packageId,
      );

    if (
      !packageService ||
      packageService.name !==
        normalizedText(
          mainEventData.packageName,
        ) ||
      !sameMoney(
        packageService.price,
        money(
          mainEventData.packagePrice,
          "Main-event package price",
        ),
      )
    ) {
      throw invalidServiceLinkage();
    }

    expectedServiceIds.add(packageId);
  } else if (
    requestData.packageId !== null ||
    requestData.packageName !== null
  ) {
    throw invalidServiceLinkage();
  }

  if (
    expectedServiceIds.size === 0 ||
    services.length !==
      expectedServiceIds.size ||
    services.some(
      (service) =>
        !expectedServiceIds.has(
          service.serviceId,
        ),
    )
  ) {
    throw invalidServiceLinkage();
  }

  const serviceById = new Map(
    services.map((service) => [
      service.serviceId,
      service,
    ]),
  );

  for (
    const selectedService of
      selectedServices
  ) {
    const service =
      serviceById.get(
        selectedService.serviceId,
      );

    if (
      !service ||
      service.name !==
        selectedService.name ||
      service.category !==
        selectedService.category ||
      !sameMoney(
        service.price,
        selectedService.price,
      ) ||
      !sameMoney(
        service.downPaymentPercentage,
        selectedService
          .downPaymentPercentage,
      )
    ) {
      throw invalidServiceLinkage();
    }
  }
}

function authorizedRequestType(
  requestData: DocumentData,
): "catering" | "addon" | null {
  return requestData.type === "catering" ||
    requestData.type === "addon" ?
    requestData.type :
    null;
}

function providerRequestServices(
  value: unknown,
): ServiceSnapshot[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > 100
  ) {
    throw invalidServiceLinkage();
  }

  const services = value.map(
    (candidate): ServiceSnapshot => {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        throw invalidServiceLinkage();
      }

      const service =
        candidate as DocumentData;
      const price = money(
        service.price,
        "Provider-request service price",
      );
      const downPaymentPercentage =
        percentage(
          service.downPaymentPercentage,
          "Provider-request service down-payment percentage",
        );
      const downPaymentAmount = money(
        service.downPaymentAmount,
        "Provider-request service down payment",
      );

      if (
        !sameMoney(
          downPaymentAmount,
          roundCurrency(
            price *
              (downPaymentPercentage /
                100),
          ),
        )
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The provider-request financial snapshot is invalid.",
        );
      }

      return {
        serviceId:
          requiredId(
            service,
            "serviceId",
          ),
        name: requiredText(
          service,
          "name",
        ),
        category: requiredText(
          service,
          "category",
        ),
        price,
        downPaymentPercentage,
        downPaymentAmount,
      };
    },
  );
  const ids = new Set(
    services.map(
      (service) => service.serviceId,
    ),
  );

  if (ids.size !== services.length) {
    throw invalidServiceLinkage();
  }

  return services;
}

function selectedServiceSnapshots(
  value: unknown,
): SelectedServiceSnapshot[] {
  if (!Array.isArray(value)) {
    throw invalidServiceLinkage();
  }

  return value.map(
    (candidate): SelectedServiceSnapshot => {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        throw invalidServiceLinkage();
      }

      const service =
        candidate as DocumentData;

      return {
        serviceId:
          requiredId(
            service,
            "addonId",
          ),
        providerId:
          requiredId(
            service,
            "providerId",
          ),
        name: requiredText(
          service,
          "name",
        ),
        category: requiredText(
          service,
          "category",
        ),
        price: money(
          service.price,
          "Selected service price",
        ),
        downPaymentPercentage:
          percentage(
            service.downPaymentPercentage,
            "Selected service down-payment percentage",
          ),
      };
    },
  );
}

function assertEventHasNotStarted(
  input: {
    eventDate: Timestamp;
    eventTime: string;
    now: Date;
  },
): void {
  const dateKey =
    manilaDateKey(
      input.eventDate.toDate(),
    );
  const start = new Date(
    `${dateKey}T${input.eventTime}:00+08:00`,
  );

  if (
    !dateKey ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(input.now.getTime()) ||
    input.now.getTime() >= start.getTime()
  ) {
    throw new HttpsError(
      "failed-precondition",
      "This request can no longer be accepted because the event has started.",
    );
  }
}

function sharedText(
  requestData: DocumentData,
  mainEventData: DocumentData,
  field: string,
): string {
  const requestValue =
    requiredText(requestData, field);
  const mainEventValue =
    requiredText(mainEventData, field);

  if (requestValue !== mainEventValue) {
    throw snapshotMismatch(field);
  }

  return requestValue;
}

function requiredText(
  data: DocumentData,
  field: string,
): string {
  const value = normalizedText(
    data[field],
  );

  if (!value || value.length > 500) {
    throw snapshotMismatch(field);
  }

  return value;
}

function normalizedText(
  value: unknown,
): string {
  return typeof value === "string" ?
    value.trim() :
    "";
}

function requiredId(
  data: DocumentData,
  field: string,
): string {
  const value = optionalId(data[field]);

  if (!value) {
    throw invalidLinkage();
  }

  return value;
}

function optionalId(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return SAFE_DOCUMENT_ID.test(normalized) ?
    normalized :
    null;
}

function positiveInteger(
  value: unknown,
  label: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) <= 0
  ) {
    throw new HttpsError(
      "failed-precondition",
      `${label} is invalid.`,
    );
  }

  return value as number;
}

function money(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isSafeInteger(
      Math.round(value * 100),
    )
  ) {
    throw new HttpsError(
      "failed-precondition",
      `${label} is invalid.`,
    );
  }

  return roundCurrency(value);
}

function percentage(
  value: unknown,
  label: string,
): number {
  const result = money(value, label);

  if (result > 100) {
    throw new HttpsError(
      "failed-precondition",
      `${label} is invalid.`,
    );
  }

  return result;
}

function sameMoney(
  left: number,
  right: number,
): boolean {
  return Math.round(left * 100) ===
    Math.round(right * 100);
}

function roundCurrency(
  value: number,
): number {
  return Math.round(
    (value + Number.EPSILON) * 100,
  ) / 100;
}

function isCanonicalTime(
  value: string,
): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/u.test(
    value,
  );
}

function minutes(
  value: string,
): number {
  const [hours, minute] =
    value.split(":").map(Number);

  return hours * 60 + minute;
}

function invalidLinkage(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "The provider-request linkage is invalid.",
  );
}

function invalidServiceLinkage(): HttpsError {
  return new HttpsError(
    "failed-precondition",
    "The provider-request service linkage is invalid.",
  );
}

function snapshotMismatch(
  field: string,
): HttpsError {
  return new HttpsError(
    "failed-precondition",
    `The provider-request ${field} does not match the main event.`,
  );
}
