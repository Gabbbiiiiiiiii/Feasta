/**
 * Protect legacy scalar package creation and updates from concurrent
 * occasion deactivation. All authority reads participate in the same
 * Firestore transaction as the eventual package write.
 */
import {HttpsError} from "firebase-functions/v2/https";
import {db} from "../shared/firestore.js";
import {
  activeOccasionAuthority,
  stableOccasionPublicationGeneration,
} from "./occasion-publication-generation.js";

export async function requireLegacyPackageOccasionAuthority(
  transaction: FirebaseFirestore.Transaction,
  eventType: string,
  serviceCategoryCode: NonNullable<
    Parameters<typeof activeOccasionAuthority>[2]
  >,
): Promise<void> {
  const catalogSnapshot = await transaction.get(
    db.collection("occasionCatalog").doc("current"),
  );

  if (stableOccasionPublicationGeneration(catalogSnapshot.data()) === null) {
    throw new HttpsError(
      "failed-precondition",
      "Package editing is unavailable during occasion maintenance.",
      {reason: "OCCASION_CATALOG_UNAVAILABLE"},
    );
  }

  const occasionSnapshot = await transaction.get(
    db.collection("occasions").doc(eventType),
  );

  if (!activeOccasionAuthority(
    occasionSnapshot.data(),
    eventType,
    serviceCategoryCode,
  )) {
    throw new HttpsError(
      "failed-precondition",
      "This occasion is inactive or unavailable for this service.",
      {reason: "OCCASION_UNAVAILABLE"},
    );
  }
}