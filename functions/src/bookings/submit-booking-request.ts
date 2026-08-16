import {createHash} from "node:crypto";

import {getAuth} from "firebase-admin/auth";
import {Timestamp} from "firebase-admin/firestore";
import {
  HttpsError,
  onCall,
} from "firebase-functions/v2/https";

import {
  writeAuditLogInTransaction,
} from "../shared/audit.js";
import {requireAuth} from "../shared/auth.js";
import {
  requireRole,
} from "../shared/authorization.js";
import {
  isApprovedProviderForOperations,
} from "../shared/constants.js";
import {db} from "../shared/firestore.js";
import {
  appCheckCallableOptions,
} from "../shared/function-options.js";
import {logError} from "../shared/logger.js";
import {
  createNotificationInTransaction,
} from "../shared/notifications.js";
import {
  enforceCallableRateLimit,
} from "../shared/rate-limit.js";
import {
  logSecurityEvent,
} from "../shared/security-events.js";
import {
  serverTimestamp,
} from "../shared/timestamps.js";
import {
  assertBookingSubmissionAllowed,
} from "./booking-authorization.js";

type UnknownRecord = Record<string, unknown>;

type AddOnSource =
  | "catering_provider"
  | "feasta_addon_provider";

type SelectedAddOn = {
  addonId: string;
  providerId: string;
  name: string;
  category: string;
  price: number;
  downPaymentPercentage: number;
  source: AddOnSource;
};

type MarketplaceProvider = {
  providerId: string;
  ownerId: string;
  businessName: string;
};

type ProviderRequestService = {
  serviceId: string;
  name: string;
  category: string;
  price: number;
  downPaymentPercentage: number;
  downPaymentAmount: number;
};

const COLLECTIONS = {
  users: "users",
  customers: "customers",
  providers: "providers",
  packages: "packages",
  addons: "addons",
  mainEvents: "mainEvents",
  providerRequests: "providerRequests",
} as const;

/**
 * Creates the overall event and one request for each
 * selected provider.
 *
 * Prices, providers, packages, and add-ons are validated
 * and calculated exclusively on the server.
 */
export const submitBookingRequest = onCall(
  {
    ...appCheckCallableOptions,
    timeoutSeconds: 30,
  },
  async (request) => {
    const actor = requireAuth(request);

    await requireRole(actor.uid, ["customer"]);

    await enforceCallableRateLimit(request, {
      scope: "bookings.submit",
      limit: 8,
      windowSeconds: 10 * 60,
    });

    try {
      const input = asRecord(request.data);

      const clientRequestId = requireId(
        input,
        "clientRequestId",
      );

      const cateringProviderId = requireId(
        input,
        "providerId",
      );

      const packageId = requireId(
        input,
        "packageId",
      );

      const eventType = requireText(
        input,
        "eventType",
        1,
        80,
      );

      const eventTime = requireText(
        input,
        "eventTime",
        1,
        40,
      );

      const eventEndTime = requireText(
        input,
        "eventEndTime",
        1,
        40,
      );

      const eventLocation = requireText(
        input,
        "eventLocation",
        1,
        180,
      );

      const eventAddress = requireText(
        input,
        "eventAddress",
        1,
        500,
      );

      const specialRequest = optionalText(
        input,
        "specialRequest",
        1_000,
      );

      const customerArrangedAddOnsNote =
        optionalText(
          input,
          "customerArrangedAddOnsNote",
          500,
        );

      const guestCount = requireInteger(
        input,
        "guestCount",
        1,
        10_000,
      );

      const eventDate = requireFutureDate(
        input.eventDate,
      );

      const selectedFoods = requireStringList(
        input,
        "selectedFoods",
        50,
        120,
      );

      const selectedDecorations =
        requireStringList(
          input,
          "selectedDecorations",
          50,
          120,
        );

      const selectedFurniture =
        requireStringList(
          input,
          "selectedFurniture",
          50,
          120,
        );

      const addonIds = [
        ...new Set(
          requireStringList(
            input,
            "addonIds",
            20,
            160,
          ),
        ),
      ];

      const willArrangeOwnAddOns =
        input.willArrangeOwnAddOns === true;

      const authUser = await getAuth().getUser(
        actor.uid,
      );

      const bookingId = createHash("sha256")
        .update(
          `${actor.uid}:${clientRequestId}`,
        )
        .digest("hex")
        .slice(0, 40);

      const bookingCode =
        `BK-${bookingId
          .slice(0, 10)
          .toUpperCase()}`;

      const submissionFingerprint =
        createSubmissionFingerprint({
          customerId: actor.uid,
          cateringProviderId,
          packageId,
          eventType,
          eventDate:
            eventDate.toISOString(),
          eventTime,
          eventEndTime,
          eventLocation,
          eventAddress,
          guestCount,
          selectedFoods,
          selectedDecorations,
          selectedFurniture,
          addonIds: [...addonIds].sort(),
          specialRequest,
          willArrangeOwnAddOns,
          customerArrangedAddOnsNote,
        });

      const bookingReference = db
        .collection(COLLECTIONS.mainEvents)
        .doc(bookingId);

      const userReference = db
        .collection(COLLECTIONS.users)
        .doc(actor.uid);

      const customerReference = db
        .collection(COLLECTIONS.customers)
        .doc(actor.uid);

      const cateringProviderReference = db
        .collection(COLLECTIONS.providers)
        .doc(cateringProviderId);

      const packageReference = db
        .collection(COLLECTIONS.packages)
        .doc(packageId);

      const addonReferences = addonIds.map(
        (addonId) =>
          db
            .collection(COLLECTIONS.addons)
            .doc(addonId),
      );

      const result = await db.runTransaction(
        async (transaction) => {
          const [
            existingSnapshot,
            userSnapshot,
            customerSnapshot,
            cateringProviderSnapshot,
            packageSnapshot,
            ...addonSnapshots
          ] = await Promise.all([
            transaction.get(bookingReference),
            transaction.get(userReference),
            transaction.get(customerReference),
            transaction.get(
              cateringProviderReference,
            ),
            transaction.get(packageReference),
            ...addonReferences.map((reference) =>
              transaction.get(reference),
            ),
          ]);

          if (existingSnapshot.exists) {
            const existing =
              existingSnapshot.data() ?? {};

            if (
              existing.customerId !== actor.uid
            ) {
              throw new HttpsError(
                "permission-denied",
                "Booking ownership is invalid.",
              );
            }

            if (
              typeof existing
                .submissionFingerprint ===
                "string" &&
              existing.submissionFingerprint !==
                submissionFingerprint
            ) {
              throw new HttpsError(
                "already-exists",
                "This request identifier was already used for another booking.",
              );
            }

            return {
              bookingId,
              mainEventId: bookingId,
              providerRequestIds:
                normalizeStringArray(
                  existing.providerRequestIds,
                ),
              created: false,
            };
          }

          if (!userSnapshot.exists) {
            throw new HttpsError(
              "permission-denied",
              "Account is unavailable.",
            );
          }

          const user = userSnapshot.data() ?? {};

          assertBookingSubmissionAllowed(
            user,
            request.auth?.token
              .email_verified === true,
            authUser.phoneNumber,
          );

          if (!customerSnapshot.exists) {
            throw new HttpsError(
              "not-found",
              "Customer profile was not found.",
            );
          }

          const customer =
            customerSnapshot.data() ?? {};

          const customerPhoneNumber =
            stringValue(user.phoneNumber);

          if (!customerPhoneNumber) {
            throw new HttpsError(
              "failed-precondition",
              "A verified customer phone number is required.",
            );
          }

          if (
            !cateringProviderSnapshot.exists
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Catering provider is unavailable.",
            );
          }

          const cateringProvider =
            cateringProviderSnapshot.data() ?? {};

          if (
            !isApprovedProviderForOperations(
              cateringProvider,
            )
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Catering provider is unavailable.",
            );
          }

          const cateringProviderOwnerId =
            stringValue(
              cateringProvider.ownerId,
            );

          if (!cateringProviderOwnerId) {
            throw new HttpsError(
              "failed-precondition",
              "Catering provider ownership is invalid.",
            );
          }

          if (!packageSnapshot.exists) {
            throw new HttpsError(
              "failed-precondition",
              "Package is unavailable.",
            );
          }

          const packageData =
            packageSnapshot.data() ?? {};

          if (
            packageData.providerId !==
              cateringProviderId ||
            packageData.isActive !== true ||
            packageData.isDeleted === true
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Package is unavailable.",
            );
          }

          validatePackageSelections(
            selectedFoods,
            packageData.foodInclusions,
            "selectedFoods",
          );

          validatePackageSelections(
            selectedDecorations,
            packageData.decorInclusions,
            "selectedDecorations",
          );

          validatePackageSelections(
            selectedFurniture,
            packageData.furnitureInclusions,
            "selectedFurniture",
          );

          const packagePrice =
            requireStoredMoney(
              packageData.price,
              "Package price",
            );

          const packageDownPaymentPercentage =
            requireStoredPercentage(
              packageData.downPaymentPercentage,
              "Package down-payment percentage",
              0,
            );

          const selectedAddOns =
            addonSnapshots.map(
              (snapshot): SelectedAddOn => {
                if (!snapshot.exists) {
                  throw new HttpsError(
                    "failed-precondition",
                    "An add-on is unavailable.",
                  );
                }

                const addon =
                  snapshot.data() ?? {};

                if (
                  addon.isActive !== true ||
                  addon.isAvailable !== true ||
                  addon.isDeleted === true
                ) {
                  throw new HttpsError(
                    "failed-precondition",
                    "An add-on is unavailable.",
                  );
                }

                const addonProviderId =
                  stringValue(addon.providerId);

                if (!addonProviderId) {
                  throw new HttpsError(
                    "failed-precondition",
                    "An add-on provider is invalid.",
                  );
                }

                const price =
                  requireStoredMoney(
                    addon.price,
                    "Add-on price",
                  );

                const source: AddOnSource =
                  addonProviderId ===
                  cateringProviderId
                    ? "catering_provider"
                    : "feasta_addon_provider";

                return {
                  addonId: snapshot.id,
                  providerId:
                    addonProviderId,
                  name:
                    stringValue(addon.name) ||
                    "Unnamed add-on",
                  category:
                    stringValue(
                      addon.category,
                    ) || "event_service",
                  price,
                  downPaymentPercentage:
                    requireStoredPercentage(
                      addon
                        .downPaymentPercentage,
                      "Add-on down-payment percentage",
                      source ===
                        "catering_provider"
                        ? packageDownPaymentPercentage
                        : 100,
                    ),
                  source,
                };
              },
            );

          const cateringAddOns =
            selectedAddOns.filter(
              (addon) =>
                addon.source ===
                "catering_provider",
            );

          const marketplaceAddOns =
            selectedAddOns.filter(
              (addon) =>
                addon.source ===
                "feasta_addon_provider",
            );

          const marketplaceAddOnsByProvider =
            groupAddOnsByProvider(
              marketplaceAddOns,
            );

          const marketplaceProviderIds = [
            ...marketplaceAddOnsByProvider.keys(),
          ];

          const marketplaceProviderSnapshots =
            await Promise.all(
              marketplaceProviderIds.map(
                (providerId) =>
                  transaction.get(
                    db
                      .collection(
                        COLLECTIONS.providers,
                      )
                      .doc(providerId),
                  ),
              ),
            );

          const marketplaceProviders =
            new Map<
              string,
              MarketplaceProvider
            >();

          for (
            const providerSnapshot of
            marketplaceProviderSnapshots
          ) {
            if (!providerSnapshot.exists) {
              throw new HttpsError(
                "failed-precondition",
                "An add-on provider is unavailable.",
              );
            }

            const provider =
              providerSnapshot.data() ?? {};

            if (
              !isApprovedProviderForOperations(
                provider,
              )
            ) {
              throw new HttpsError(
                "failed-precondition",
                "An add-on provider is unavailable.",
              );
            }

            const ownerId = stringValue(
              provider.ownerId,
            );

            if (!ownerId) {
              throw new HttpsError(
                "failed-precondition",
                "An add-on provider owner is invalid.",
              );
            }

            marketplaceProviders.set(
              providerSnapshot.id,
              {
                providerId:
                  providerSnapshot.id,
                ownerId,
                businessName:
                  stringValue(
                    provider.businessName,
                  ) || "Unnamed provider",
              },
            );
          }

          const cateringServices:
            ProviderRequestService[] = [
              {
                serviceId: packageId,
                name:
                  stringValue(
                    packageData.name,
                  ) || "Catering package",
                category:
                  "catering_package",
                price: packagePrice,
                downPaymentPercentage:
                  packageDownPaymentPercentage,
                downPaymentAmount:
                  calculateDownPayment(
                    packagePrice,
                    packageDownPaymentPercentage,
                  ),
              },
              ...cateringAddOns.map(
                (addon) =>
                  serviceFromAddOn(addon),
              ),
            ];

          const cateringSubtotal =
            calculateServiceTotal(
              cateringServices,
            );

          const cateringDownPaymentAmount =
            calculateServiceDownPayment(
              cateringServices,
            );

          const cateringEffectivePercentage =
            calculateEffectivePercentage(
              cateringSubtotal,
              cateringDownPaymentAmount,
            );

          const marketplaceAddOnsTotal =
            calculateServiceTotal(
              marketplaceAddOns.map(
                (addon) =>
                  serviceFromAddOn(addon),
              ),
            );

          const estimatedEventTotal =
            roundCurrency(
              cateringSubtotal +
                marketplaceAddOnsTotal,
            );

          const providerRequestIds: string[] =
            [];

          const cateringRequestId =
            createProviderRequestId(
              bookingId,
              "catering",
              cateringProviderId,
            );

          providerRequestIds.push(
            cateringRequestId,
          );

          const marketplaceRequestEntries = [
            ...marketplaceAddOnsByProvider
              .entries(),
          ];

          for (
            const [
              marketplaceProviderId,
            ] of marketplaceRequestEntries
          ) {
            providerRequestIds.push(
              createProviderRequestId(
                bookingId,
                "addon",
                marketplaceProviderId,
              ),
            );
          }

          const providerRequestCount =
            providerRequestIds.length;

          transaction.create(
            bookingReference,
            {
              bookingId,
              mainEventId: bookingId,
              bookingCode,
              clientRequestId,
              submissionFingerprint,

              customerId: actor.uid,
              customerFirstName:
                stringValue(
                  customer.firstName,
                ),
              customerLastName:
                stringValue(customer.lastName),
              customerEmail:
                stringValue(customer.email),
              customerPhoneNumber,

              providerId:
                cateringProviderId,
              currentProviderId:
                cateringProviderId,
              originalProviderId:
                cateringProviderId,
              providerBusinessName:
                stringValue(
                  cateringProvider
                    .businessName,
                ),

              packageId,
              packageName:
                stringValue(
                  packageData.name,
                ),

              eventType,
              eventDate:
                Timestamp.fromDate(
                  eventDate,
                ),
              eventTime,
              eventEndTime,
              guestCount,
              eventLocation,
              eventAddress,

              selectedFoods,
              selectedDecorations,
              selectedFurniture,
              selectedAddOns,

              willArrangeOwnAddOns,
              customerArrangedAddOnsNote,
              outsidePlatformServicesMonitored:
                false,

              specialRequest,

              packagePrice,
              cateringAddOnsTotal:
                roundCurrency(
                  cateringSubtotal -
                    packagePrice,
                ),
              marketplaceAddOnsTotal,
              cateringSubtotal,
              estimatedEventTotal,

              // Compatibility fields used by the
              // current catering payment workflow.
              addOnsTotal:
                roundCurrency(
                  cateringSubtotal -
                    packagePrice,
                ),
              totalAmount:
                cateringSubtotal,
              downPaymentPercentage:
                cateringEffectivePercentage,
              downPaymentAmount:
                cateringDownPaymentAmount,
              remainingBalance:
                roundCurrency(
                  cateringSubtotal -
                    cateringDownPaymentAmount,
                ),

              status:
                "pending_provider_approval",
              paymentStatus: "unpaid",
              recoveryStatus: "none",
              cancellationStatus: "none",
              refundStatus: "none",
              refundAmount: 0,

              providerRequestIds,
              providerRequestCount,
              pendingProviderRequestCount:
                providerRequestCount,
              confirmedProviderRequestCount: 0,
              rejectedProviderRequestCount: 0,
              completedProviderRequestCount: 0,

              rejectedByProviderIds: [],

              submittedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          );

          transaction.create(
            bookingReference
              .collection("timeline")
              .doc(),
            {
              status:
                "pending_provider_approval",
              title:
                "Booking Request Submitted",
              description:
                "Customer submitted booking requests to the selected providers.",
              createdBy: actor.uid,
              createdByRole: "customer",
              createdAt: serverTimestamp(),
            },
          );

          transaction.create(
            db
              .collection(
                COLLECTIONS.providerRequests,
              )
              .doc(cateringRequestId),
            {
              providerRequestId:
                cateringRequestId,
              mainEventId: bookingId,
              bookingId,

              customerId: actor.uid,
              customerFirstName:
                stringValue(
                  customer.firstName,
                ),
              customerLastName:
                stringValue(customer.lastName),
              customerEmail:
                stringValue(customer.email),
              customerPhoneNumber,

              providerId:
                cateringProviderId,
              providerBusinessName:
                stringValue(
                  cateringProvider
                    .businessName,
                ),

              type: "catering",

              packageId,
              packageName:
                stringValue(
                  packageData.name,
                ),

              services: cateringServices,

              amount: cateringSubtotal,
              downPaymentPercentage:
                cateringEffectivePercentage,
              downPaymentAmount:
                cateringDownPaymentAmount,
              remainingBalance:
                roundCurrency(
                  cateringSubtotal -
                    cateringDownPaymentAmount,
                ),

              status: "pending",
              paymentStatus: "unpaid",

              eventType,
              eventDate:
                Timestamp.fromDate(
                  eventDate,
                ),
              eventTime,
              eventEndTime,
              eventLocation,
              eventAddress,
              guestCount,

              rejectionReason: null,
              cancellationReason: null,

              requestedAt: serverTimestamp(),
              respondedAt: null,
              confirmedAt: null,
              completedAt: null,
              cancelledAt: null,
              expiresAt: null,

              paymentId: null,
              paidAt: null,

              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
          );

          createNotificationInTransaction(
            transaction,
            {
              userId:
                cateringProviderOwnerId,
              title: "New Booking Request",
              message:
                "A customer sent a catering booking request.",
              type: "booking",
              relatedId:
                cateringRequestId,
              relatedCollection:
                COLLECTIONS.providerRequests,
            },
          );

          for (
            const [
              marketplaceProviderId,
              providerAddOns,
            ] of marketplaceRequestEntries
          ) {
            const marketplaceProvider =
              marketplaceProviders.get(
                marketplaceProviderId,
              );

            if (!marketplaceProvider) {
              throw new HttpsError(
                "failed-precondition",
                "An add-on provider is unavailable.",
              );
            }

            const providerRequestId =
              createProviderRequestId(
                bookingId,
                "addon",
                marketplaceProviderId,
              );

            const services =
              providerAddOns.map(
                (addon) =>
                  serviceFromAddOn(addon),
              );

            const amount =
              calculateServiceTotal(
                services,
              );

            const providerDownPaymentAmount =
              calculateServiceDownPayment(
                services,
              );

            const effectivePercentage =
              calculateEffectivePercentage(
                amount,
                providerDownPaymentAmount,
              );

            transaction.create(
              db
                .collection(
                  COLLECTIONS
                    .providerRequests,
                )
                .doc(providerRequestId),
              {
                providerRequestId,
                mainEventId: bookingId,
                bookingId,

                customerId: actor.uid,
                customerFirstName:
                  stringValue(
                    customer.firstName,
                  ),
                customerLastName:
                  stringValue(
                    customer.lastName,
                  ),
                customerEmail:
                  stringValue(
                    customer.email,
                  ),
                customerPhoneNumber,

                providerId:
                  marketplaceProvider
                    .providerId,
                providerBusinessName:
                  marketplaceProvider
                    .businessName,

                type: "addon",
                packageId: null,
                packageName: null,

                services,

                amount,
                downPaymentPercentage:
                  effectivePercentage,
                downPaymentAmount:
                  providerDownPaymentAmount,
                remainingBalance:
                  roundCurrency(
                    amount -
                      providerDownPaymentAmount,
                  ),

                status: "pending",
                paymentStatus: "unpaid",

                eventType,
                eventDate:
                  Timestamp.fromDate(
                    eventDate,
                  ),
                eventTime,
                eventEndTime,
                eventLocation,
                eventAddress,
                guestCount,

                rejectionReason: null,
                cancellationReason: null,

                requestedAt:
                  serverTimestamp(),
                respondedAt: null,
                confirmedAt: null,
                completedAt: null,
                cancelledAt: null,
                expiresAt: null,

                paymentId: null,
                paidAt: null,

                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
            );

            createNotificationInTransaction(
              transaction,
              {
                userId:
                  marketplaceProvider.ownerId,
                title:
                  "New Add-on Request",
                message:
                  "A customer requested your services for an event.",
                type: "booking",
                relatedId:
                  providerRequestId,
                relatedCollection:
                  COLLECTIONS.providerRequests,
              },
            );
          }

          writeAuditLogInTransaction(
            transaction,
            {
              actorId: actor.uid,
              actorRole: "customer",
              action: "booking.submitted",
              targetCollection:
                COLLECTIONS.mainEvents,
              targetId: bookingId,
              after: {
                status:
                  "pending_provider_approval",
                providerRequestCount,
                estimatedEventTotal,
              },
              metadata: {
                providerRequestIds,
              },
            },
          );

          return {
            bookingId,
            mainEventId: bookingId,
            providerRequestIds,
            created: true,
          };
        },
      );

      logSecurityEvent({
        action: "booking_submission",
        outcome: "succeeded",
        actorUid: actor.uid,
        targetId: result.bookingId,
        metadata: {
          created: result.created,
          providerRequestCount:
            result.providerRequestIds.length,
        },
      });

      return result;
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      logError(
        "Booking submission failed",
        error,
        {
          actorUid: actor.uid,
        },
      );

      throw new HttpsError(
        "internal",
        "Unable to submit booking.",
      );
    }
  },
);

function asRecord(
  value: unknown,
): UnknownRecord {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Request is invalid.",
    );
  }

  return value as UnknownRecord;
}

function requireId(
  data: UnknownRecord,
  field: string,
): string {
  const value = requireText(
    data,
    field,
    8,
    160,
  );

  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new HttpsError(
      "invalid-argument",
      `${field} is invalid.`,
    );
  }

  return value;
}

function requireText(
  data: UnknownRecord,
  field: string,
  minimum: number,
  maximum: number,
): string {
  const value = data[field];

  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      `${field} is required.`,
    );
  }

  const normalized = value.trim();

  if (
    normalized.length < minimum ||
    normalized.length > maximum
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} is invalid.`,
    );
  }

  return normalized;
}

function optionalText(
  data: UnknownRecord,
  field: string,
  maximum: number,
): string {
  const value = data[field];

  if (value == null) {
    return "";
  }

  if (
    typeof value !== "string" ||
    value.trim().length > maximum
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} is invalid.`,
    );
  }

  return value.trim();
}

function requireInteger(
  data: UnknownRecord,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const value = data[field];

  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} is invalid.`,
    );
  }

  return value as number;
}

function requireFutureDate(
  value: unknown,
): Date {
  if (typeof value !== "string") {
    throw new HttpsError(
      "invalid-argument",
      "eventDate is invalid.",
    );
  }

  const normalized = value.trim();

  const parsed = /^\d{4}-\d{2}-\d{2}$/u.test(
    normalized,
  )
    ? new Date(
      `${normalized}T00:00:00+08:00`,
    )
    : new Date(normalized);

  if (!Number.isFinite(parsed.getTime())) {
    throw new HttpsError(
      "invalid-argument",
      "eventDate is invalid.",
    );
  }

  const manilaToday =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  const eventDay =
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(parsed);

  if (eventDay < manilaToday) {
    throw new HttpsError(
      "failed-precondition",
      "The event date cannot be in the past.",
    );
  }

  return parsed;
}

function requireStringList(
  data: UnknownRecord,
  field: string,
  maximumItems: number,
  maximumLength: number,
): string[] {
  const value = data[field];

  if (
    !Array.isArray(value) ||
    value.length > maximumItems
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} is invalid.`,
    );
  }

  return value.map((item) => {
    if (
      typeof item !== "string" ||
      item.trim().length === 0 ||
      item.trim().length > maximumLength
    ) {
      throw new HttpsError(
        "invalid-argument",
        `${field} is invalid.`,
      );
    }

    return item.trim();
  });
}

function validatePackageSelections(
  selectedValues: readonly string[],
  storedValues: unknown,
  field: string,
): void {
  if (selectedValues.length === 0) {
    return;
  }

  if (!Array.isArray(storedValues)) {
    throw new HttpsError(
      "failed-precondition",
      "Package customization options are unavailable.",
    );
  }

  const allowedValues = new Set(
    storedValues.flatMap((value) => {
      if (typeof value !== "string") {
        return [];
      }

      const normalized = value.trim();

      return normalized ? [normalized] : [];
    }),
  );

  if (
    selectedValues.some(
      (value) => !allowedValues.has(value),
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      `${field} contains an option that is not available for this package.`,
    );
  }
}

function stringValue(
  value: unknown,
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function requireStoredMoney(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new HttpsError(
      "failed-precondition",
      `${label} is invalid.`,
    );
  }

  return roundCurrency(value);
}

function requireStoredPercentage(
  value: unknown,
  label: string,
  fallback: number,
): number {
  if (value == null) {
    return fallback;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  ) {
    throw new HttpsError(
      "failed-precondition",
      `${label} is invalid.`,
    );
  }

  return value;
}

function roundCurrency(
  value: number,
): number {
  return Math.round(
    (value + Number.EPSILON) * 100,
  ) / 100;
}

function calculateDownPayment(
  amount: number,
  percentage: number,
): number {
  return roundCurrency(
    amount * (percentage / 100),
  );
}

function serviceFromAddOn(
  addon: SelectedAddOn,
): ProviderRequestService {
  return {
    serviceId: addon.addonId,
    name: addon.name,
    category: addon.category,
    price: addon.price,
    downPaymentPercentage:
      addon.downPaymentPercentage,
    downPaymentAmount:
      calculateDownPayment(
        addon.price,
        addon.downPaymentPercentage,
      ),
  };
}

function calculateServiceTotal(
  services:
    readonly ProviderRequestService[],
): number {
  return roundCurrency(
    services.reduce(
      (total, service) =>
        total + service.price,
      0,
    ),
  );
}

function calculateServiceDownPayment(
  services:
    readonly ProviderRequestService[],
): number {
  return roundCurrency(
    services.reduce(
      (total, service) =>
        total +
        service.downPaymentAmount,
      0,
    ),
  );
}

function calculateEffectivePercentage(
  total: number,
  downPayment: number,
): number {
  if (total <= 0) {
    return 0;
  }

  return roundCurrency(
    (downPayment / total) * 100,
  );
}

function groupAddOnsByProvider(
  addons: readonly SelectedAddOn[],
): Map<string, SelectedAddOn[]> {
  const grouped =
    new Map<string, SelectedAddOn[]>();

  for (const addon of addons) {
    const existing =
      grouped.get(addon.providerId) ?? [];

    existing.push(addon);

    grouped.set(
      addon.providerId,
      existing,
    );
  }

  return grouped;
}

function createProviderRequestId(
  bookingId: string,
  type: "catering" | "addon",
  providerId: string,
): string {
  return createHash("sha256")
    .update(
      `${bookingId}:${type}:${providerId}`,
    )
    .digest("hex")
    .slice(0, 40);
}

function createSubmissionFingerprint(
  value: UnknownRecord,
): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function normalizeStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string" &&
      item.length > 0,
  );
}