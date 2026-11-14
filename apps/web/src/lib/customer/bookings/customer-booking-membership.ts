const SAFE_DOCUMENT_ID = /^[A-Za-z0-9_-]{1,160}$/u;
const MAX_PROVIDER_REQUESTS_PER_BOOKING = 30;

type CustomerBookingProviderRequestMembership = {
  documentId: string;
  storedProviderRequestId: unknown;
  mainEventId: unknown;
  customerId: unknown;
};

export function normalizeCanonicalProviderRequestIds(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) return [];

  const ids: string[] = [];
  const seen = new Set<string>();

  for (const candidate of value) {
    if (
      typeof candidate !== "string" ||
      !SAFE_DOCUMENT_ID.test(candidate) ||
      seen.has(candidate)
    ) {
      continue;
    }

    seen.add(candidate);
    ids.push(candidate);

    if (ids.length === MAX_PROVIDER_REQUESTS_PER_BOOKING) break;
  }

  return ids;
}

export function isCanonicalOwnedProviderRequest(
  request: CustomerBookingProviderRequestMembership,
  expected: {
    mainEventId: string;
    customerId: string;
    canonicalProviderRequestIds: ReadonlySet<string>;
  },
): boolean {
  return (
    expected.canonicalProviderRequestIds.has(request.documentId) &&
    request.storedProviderRequestId === request.documentId &&
    request.mainEventId === expected.mainEventId &&
    request.customerId === expected.customerId
  );
}

export {MAX_PROVIDER_REQUESTS_PER_BOOKING};
