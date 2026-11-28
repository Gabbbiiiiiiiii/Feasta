import "server-only";

import {FIRESTORE_COLLECTIONS} from "@feasta/shared-types";
import {parsePrivatePackageOccasions} from "@feasta/shared-types/provider-package-v2";
import {adminDb} from "@/lib/firebase/admin";

/**
 * Load validated custom occasion labels for a verified published package.
 * Used only on provider storefront and package detail surfaces—never in global marketplace search filters.
 */
export async function loadPublishedPackageCustomOccasions(
  providerId: string,
  packageId: string,
): Promise<string[]> {
  try {
    const snapshot = await adminDb
      .collection(FIRESTORE_COLLECTIONS.providers)
      .doc(providerId)
      .collection("packagePrivateOccasions")
      .doc(packageId)
      .get();
    if (!snapshot.exists) return [];
    const raw = snapshot.get("labels");
    if (!Array.isArray(raw) || raw.length === 0) return [];
    return parsePrivatePackageOccasions(raw);
  } catch {
    return [];
  }
}
