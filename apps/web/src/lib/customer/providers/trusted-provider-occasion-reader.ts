import "server-only";

import {adminDb} from "@/lib/firebase/admin";
import {hasVerifiedProviderOccasion} from "./verified-provider-occasion";

const occasionIdPattern = /^[a-z][a-z0-9_]{1,63}$/u;
const MAX_CANDIDATES = 50;

type ProviderCandidate = {
  id: string;
  data: Readonly<Record<string, unknown>>;
};

export type TrustedOccasionCheck = {
  valid: boolean;
  eligibleProviderIds: ReadonlySet<string>;
};

function positiveRevision(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0;
}

/**
 * Checks a bounded set of provider candidates against protected
 * Admin-managed occasion eligibility authorities.
 *
 * This module must never be imported into a client component.
 */
export async function checkTrustedProviderOccasion(
  occasionId: string,
  candidates: readonly ProviderCandidate[],
): Promise<TrustedOccasionCheck> {
  const denied = (): TrustedOccasionCheck => ({
    valid: false,
    eligibleProviderIds: new Set<string>(),
  });

  if (
    !occasionIdPattern.test(occasionId) ||
    candidates.length > MAX_CANDIDATES ||
    new Set(candidates.map((candidate) => candidate.id)).size !== candidates.length
  ) {
    return denied();
  }

  try {
    const catalogRef = adminDb.doc("occasionCatalog/current");
    const occasionRef = adminDb.collection("occasions").doc(occasionId);

    const [catalogSnapshot, occasionSnapshot] = await Promise.all([
      catalogRef.get(),
      occasionRef.get(),
    ]);

    const catalog = catalogSnapshot.data();
    const occasion = occasionSnapshot.data();

    if (
      catalog?.activationState !== "stable" ||
      !positiveRevision(catalog.revision) ||
      !occasion ||
      occasion.id !== occasionId ||
      occasion.active !== true ||
      occasion.moderationState !== "approved"
    ) {
      return denied();
    }

    const authorityRefs = candidates.map((candidate) =>
      adminDb.collection("providerEligibilityAuthorities").doc(candidate.id),
    );

    const authoritySnapshots = authorityRefs.length
      ? await adminDb.getAll(...authorityRefs)
      : [];

    if (authoritySnapshots.length !== candidates.length) {
      return denied();
    }

    const catalogAfter = (await catalogRef.get()).data();

    if (
      catalogAfter?.activationState !== "stable" ||
      catalogAfter.revision !== catalog.revision
    ) {
      return denied();
    }

    const eligibleProviderIds = new Set<string>();

    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      const authoritySnapshot = authoritySnapshots[index];

      if (!candidate || !authoritySnapshot ||
          authoritySnapshot.id !== candidate.id) {
        return denied();
      }

      const authority = authoritySnapshot.exists
        ? authoritySnapshot.data() ?? null
        : null;

      const authorityRevision = authority?.revision;

      if (!positiveRevision(authorityRevision)) {
        continue;
      }

      if (hasVerifiedProviderOccasion({
        occasionId,
        provider: candidate.data,
        authority,
        catalog,
        occasion,
        expectedCatalogRevision: catalog.revision,
        expectedProviderEligibilityRevision: authorityRevision,
      })) {
        eligibleProviderIds.add(candidate.id);
      }
    }

    return {
      valid: true,
      eligibleProviderIds,
    };
  } catch {
    return denied();
  }
}