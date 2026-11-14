import {FieldPath} from "firebase-admin/firestore";
import {defineSecret} from "firebase-functions/params";
import {HttpsError, onCall} from "firebase-functions/v2/https";

import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {loadOccasionCatalogReadPolicy} from "./provider-package-v2-policy-read.js";
import {
  consumeOccasionCatalogCandidates, decodeOccasionCursor, encodeOccasionCursor,
  OCCASION_CATALOG_CANDIDATE_BUDGET, parseListApprovedOccasionsInput,
} from "./provider-package-v2-public-occasion-contract.js";

// No secret value is created, assumed, or read at module initialization.
const occasionCursorSecret = defineSecret("FEASTA_OCCASION_CATALOG_CURSOR_HMAC_KEY");

function unavailable(): HttpsError {
  return new HttpsError("failed-precondition", "V2 catalog is not ready.",
    {reason: "CONFIG_UNAVAILABLE"});
}

function requireCatalogRevision(raw: FirebaseFirestore.DocumentData | undefined): number {
  if (!raw || !Number.isSafeInteger(raw.revision) || raw.revision < 1) {
    throw unavailable();
  }
  // Transitional catalog generations must not be shown as a stable snapshot.
  if (raw.activationState !== "stable") throw unavailable();
  return raw.revision as number;
}

function secretKey(): Buffer {
  const value = occasionCursorSecret.value();
  if (!value || !/^[A-Za-z0-9_-]+$/u.test(value)) throw unavailable();
  const key = Buffer.from(value, "base64url");
  if (key.length < 32 || key.toString("base64url") !== value) throw unavailable();
  return key;
}

/** Implemented but NOT exported from functions/src/index.ts until integration review. */
export const listApprovedOccasions = onCall(
  {...appCheckCallableOptions, secrets: [occasionCursorSecret]},
  async (request) => {
    const input = parseListApprovedOccasionsInput(request.data);
    await loadOccasionCatalogReadPolicy();
    await enforceCallableRateLimit(request, {
      scope: "listApprovedOccasionsV2", limit: 60, windowSeconds: 3600,
    });
    const key = secretKey();

    if (input.serviceCategoryCode) {
      const category = await db.collection("serviceCategories")
        .doc(input.serviceCategoryCode).get();
      const categoryData = category.data();
      if (!category.exists || categoryData?.code !== input.serviceCategoryCode ||
        categoryData.status !== "active" ||
        (categoryData.serviceType !== "catering" && categoryData.serviceType !== "addon")) {
        throw new HttpsError("invalid-argument", "Invalid service category.",
          {reason: "INVALID_SERVICE_CATEGORY"});
      }
    }

    const catalog = db.collection("occasionCatalog").doc("current");
    const revision = requireCatalogRevision((await catalog.get()).data());
    const position = decodeOccasionCursor(revision, input, key);
    // Frozen V2 index: active ASC, sortOrder ASC, document ID ASC.
    // Applicability and approval are checked by a bounded gateway, not
    // Firestore array-contains queries or a different unapproved index.
    let ordered = db.collection("occasions")
      .where("active", "==", true)
      .orderBy("sortOrder", "asc")
      .orderBy(FieldPath.documentId(), "asc");
    if (position) ordered = ordered.startAfter(position.sortOrder, position.id);
    const candidateLimit = input.serviceCategoryCode ?
      OCCASION_CATALOG_CANDIDATE_BUDGET + 1 : input.pageSize + 1;
    const docs = (await ordered.limit(candidateLimit).get()).docs;
    const {items, nextPosition} = consumeOccasionCatalogCandidates(
      docs.map((document) => ({id: document.id, data: document.data()})), input);
    const nextCursor = nextPosition ?
      encodeOccasionCursor(revision, input, nextPosition, key) : null;

    // Recheck after the page query; changing generations invalidate this read.
    if (requireCatalogRevision((await catalog.get()).data()) !== revision) {
      throw new HttpsError("aborted", "Occasion catalog revision changed.",
        {reason: "REVISION_CONFLICT"});
    }
    return {revision, items, nextCursor};
  },
);
