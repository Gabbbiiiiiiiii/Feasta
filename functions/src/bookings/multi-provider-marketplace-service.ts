import {HttpsError} from "firebase-functions/v2/https";

type RecordData = Readonly<Record<string, unknown>>;

export type TrustedMarketplaceService = {
  serviceId: string;
  providerId: string;
  ownerId: string;
  name: string;
  category: string;
  priceInCentavos: number;
  serviceData: RecordData;
};

type Input = {
  serviceId: string;
  providerId: string;
  ownerId: string;
  providerData: RecordData;
  serviceData: RecordData;
};

function reject(message: string): never {
  throw new HttpsError("failed-precondition", message);
}

const ID_PATTERN = /^[A-Za-z0-9_-]{8,160}$/u;

/**
 * Pure validation of a freshly loaded marketplace-service record.
 *
 * The calling transaction must separately authorize the customer,
 * provider owner, active service category, availability, refund policy,
 * full-payment agreement and atomic submission.
 *
 * Never use client-supplied amounts or cached Event List records.
 */
export function resolveTrustedMarketplaceService(
  input: Input,
): TrustedMarketplaceService {
  const {
    serviceId,
    providerId,
    ownerId,
    providerData,
    serviceData,
  } = input;

  if (
    !ID_PATTERN.test(serviceId) ||
    !ID_PATTERN.test(providerId) ||
    !ID_PATTERN.test(ownerId) ||
    !providerData ||
    !serviceData ||
    typeof providerData !== "object" ||
    typeof serviceData !== "object" ||
    Array.isArray(providerData) ||
    Array.isArray(serviceData)
  ) {
    return reject("Marketplace service identity is invalid.");
  }

  if (
    providerData.ownerId !== ownerId ||
    serviceData.providerId !== providerId ||
    serviceData.ownerId !== ownerId
  ) {
    return reject("Marketplace service ownership is invalid.");
  }

  if (
    serviceData.status !== "published" ||
    serviceData.isPublished !== true ||
    serviceData.isActive !== true ||
    serviceData.isAvailable !== true ||
    serviceData.isDeleted === true
  ) {
    return reject("Marketplace service is unavailable.");
  }

  // Conservative first-stage admission.
  // Other pricing models require explicit server-side authority.
  if (serviceData.pricingType !== "fixed") {
    return reject(
      "This marketplace service pricing model is not supported.",
    );
  }

  const price = serviceData.price;

  if (
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price <= 0 ||
    price > 100_000_000
  ) {
    return reject("Marketplace service price is invalid.");
  }

  const centavos = Math.round(price * 100);

  if (
    !Number.isSafeInteger(centavos) ||
    centavos <= 0 ||
    Math.abs(price * 100 - centavos) > 1e-7
  ) {
    return reject("Marketplace service price precision is invalid.");
  }

  const name = serviceData.name;
  const category = serviceData.category;

  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 160 ||
    typeof category !== "string" ||
    !category.trim()
  ) {
    return reject("Marketplace service details are invalid.");
  }

  return {
    serviceId,
    providerId,
    ownerId,
    name: name.trim(),
    category: category.trim(),
    priceInCentavos: centavos,
    serviceData,
  };
}