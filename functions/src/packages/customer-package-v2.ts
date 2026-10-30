import {isDeepStrictEqual} from "node:util";
import type {Transaction} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import type {GlobalOccasion} from "@feasta/shared-types/provider-package-v2";
import {db} from "../shared/firestore.js";
import {isProviderPubliclyEligible} from "../shared/constants.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireMaintenanceOpen} from "../shared/maintenance.js";
import {requireActiveServiceCategoryInTransaction} from "../shared/service-category-policy.js";
import {resolveOccasionV2, occasionIds} from "./occasion-v2-validation.js";
import {projectPublicOccasionV2} from "./provider-package-v2-public-occasion-contract.js";
import {parseV2DraftWrite} from "./provider-package-drafts-v2.js";
import {exact, documentId, positiveRevision} from "./v2-validation.js";
const fields = ["name", "description", "serviceCategoryCode", "price", "serviceOptions",
  "themeOptions", "paymentPolicy", "depositPercentage", "minimumGuests", "maximumGuests",
  "imageUrl", "imageUrls", "foodInclusions", "decorInclusions", "furnitureInclusions",
  "serviceInclusions", "occasionSchemaVersion", "occasionScope", "occasionIds",
  "offerSchemaVersion",
  "sharedContractVersion", "pricingModel", "equipmentInclusions", "foodChoiceGroups"];
function unavailable(): never {
  throw new HttpsError("failed-precondition", "This package is unavailable or changed. Reload it.",
    {reason: "PACKAGE_V2_UNAVAILABLE"});
}
/** Every mutable authority and package must be in the caller's transaction read set. */
export async function requireCustomerPackageV2(tx: Transaction,
  data: Record<string, unknown>, intent: "discovery" | "booking") {
  if (process.env.FUNCTIONS_EMULATOR !== "true" ||
      !/^demo-[a-z0-9-]+$/.test(process.env.GCLOUD_PROJECT || "") ||
      !/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") ||
      !/^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || "")) unavailable();
  if (data.sharedContractVersion !== 2 || data.occasionSchemaVersion !== 2 ||
      data.offerSchemaVersion !== 2 || data.status !== "published" || data.isActive !== true ||
      data.isPublished !== true || data.providerPubliclyVisible !== true ||
      data.isDeleted !== false ||
      !data.publishedAt) unavailable();
  positiveRevision(data.revision, "CONFIG_UNAVAILABLE");
  const providerId = documentId(data.providerId, "CONFIG_UNAVAILABLE");
  const policy = (await tx.get(db.doc("contractPolicies/providerPackageV2"))).data();
  if (!policy || policy.effectiveEnvironment !== process.env.GCLOUD_PROJECT ||
      policy.featureGates?.customerDiscovery !== true ||
      intent === "booking" && policy.featureGates?.customerBooking !== true) unavailable();
  positiveRevision(policy.revision, "CONFIG_UNAVAILABLE");
  await requireMaintenanceOpen(tx, db, intent === "booking" ? "intake" : "publication");
  const provider = (await tx.get(db.doc("providers/" + providerId))).data();
  const ownerId = documentId(provider?.ownerId, "CONFIG_UNAVAILABLE");
  const owner = (await tx.get(db.doc("users/" + ownerId))).data();
  if (!provider || !owner ||
      !isProviderPubliclyEligible({...provider, id: providerId}, owner)) unavailable();
  const catalog = (await tx.get(db.doc("occasionCatalog/current"))).data();
  const authority = (await tx.get(db.doc("providerEligibilityAuthorities/" + providerId))).data();
  if (catalog?.activationState !== "stable" || !authority) unavailable();
  const category = String(data.serviceCategoryCode);
  await requireActiveServiceCategoryInTransaction(tx, category, "catering", "serviceCategoryCode");
  const rows = await tx.get(db.collection("occasions").where("active", "==", true).limit(1001));
  if (rows.size > 1000) unavailable();
  const occasions = rows.docs.map(doc => {
    projectPublicOccasionV2(doc.id, doc.data()); return doc.data() as GlobalOccasion;
  });
  const resolved = resolveOccasionV2({occasionSchemaVersion: 2,
    occasionScope: data.occasionScope, occasionIds: data.occasionIds}, {
    catalog: occasions, serviceCategoryCode: category,
    approvedOccasionIds: occasionIds(authority.approvedOccasionIds),
    approvedActiveCategoryCodes: authority.approvedCategoryCodes,
    catalogRevision: positiveRevision(catalog.revision, "CONFIG_UNAVAILABLE"),
    providerEligibilityRevision: positiveRevision(authority.revision, "CONFIG_UNAVAILABLE"),
    maxSpecificOccasions: policy.maxSpecificOccasions}, String(data.eventType));
  for (const field of ["eventType", "occasionMatchIds", "occasionCatalogRevision",
    "providerEligibilityRevision", "occasionEligibilityState"] as const) {
    if (!isDeepStrictEqual(data[field], resolved[field])) unavailable();
  }
  const input = Object.fromEntries(fields.filter(k => Object.hasOwn(data, k))
    .map(k => [k, data[k]]));
  const parsed = parseV2DraftWrite({...input, idempotencyKey: "server_customer_read_v2"}, false);
  return {...parsed.base, ...parsed.offer, ...resolved, sharedContractVersion: 2,
    providerId, revision: data.revision, status: "published", isActive: true, isPublished: true,
    providerPubliclyVisible: true, isDeleted: false,
    paymentTermsSchemaVersion: data.paymentTermsSchemaVersion,
    balanceDueHoursBeforeEvent: data.balanceDueHoursBeforeEvent};
}
/** Public allowlisted projection; never returns private drafts or authority documents. */
export const getCustomerPackageV2 = onCall({...appCheckCallableOptions, timeoutSeconds: 30},
  async request => {
    await enforceCallableRateLimit(request,
      {scope: "packages.customerV2", limit: 120, windowSeconds: 60});
    const input = exact(request.data, ["packageId"], [], "UNKNOWN_FIELD");
    const id = documentId(input.packageId, "UNKNOWN_FIELD");
    return db.runTransaction(async tx => {
      const snapshot = await tx.get(db.doc("packages/" + id));
      if (!snapshot.exists) unavailable();
      return {packageId: id,
        package: await requireCustomerPackageV2(tx, snapshot.data()!, "discovery")};
    });
  });
