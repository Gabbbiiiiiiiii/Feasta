import {isDeepStrictEqual} from "node:util";
import {isProviderPubliclyEligible} from "../shared/constants.js";
import {createHash} from "node:crypto";
import {FieldValue, Timestamp} from "firebase-admin/firestore";
import {HttpsError, onCall} from "firebase-functions/v2/https";
import type {GlobalOccasion,
  PackageEditorProgressV2} from "@feasta/shared-types/provider-package-v2";
import {requireAuth} from "../shared/auth.js";
import {requireRole} from "../shared/authorization.js";
import {resolveBackendAccountState} from "../shared/account-state.js";
import {db} from "../shared/firestore.js";
import {appCheckCallableOptions} from "../shared/function-options.js";
import {cloudinarySecrets} from "../shared/cloudinary.js";
import {enforceCallableRateLimit} from "../shared/rate-limit.js";
import {requireActiveServiceCategoryInTransaction} from "../shared/service-category-policy.js";
import {requireMaintenanceOpen, recordMaintenanceAdmission} from "../shared/maintenance.js";
import {BALANCE_DUE_HOURS_BEFORE_EVENT} from "../payments/canonical-balance-timing.js";
import {authorizeProviderForPackageManagement, authorizeOwnedPackage, assertDraftPackage,
  parseCanonicalPackageWrite, assertCanonicalPackageServiceCategory,
  assertCanonicalPackagePaymentTerms, assertPackageMatchesProviderCapabilities,
  assertPackagePaymentTermsWithinPolicy, verifyPackageImages} from "./package-domain.js";
import {packagePaymentPolicyBoundsFromData} from "./package-payment-policy.js";
import {parseOfferV2} from "./offer-v2-validation.js";
import {occasionIds, resolveOccasionV2} from "./occasion-v2-validation.js";
import {projectPublicOccasionV2} from "./provider-package-v2-public-occasion-contract.js";
import {exact, documentId, mutationKey, positiveRevision, plainText} from "./v2-validation.js";
import {validatePackageEditorProgress,
  assertNoUnverifiedEditorAssets} from "./package-editor-progress-v2.js";

const baseFields = ["name", "description", "serviceCategoryCode", "price", "serviceOptions",
  "themeOptions", "paymentPolicy", "depositPercentage", "minimumGuests", "maximumGuests",
  "imageUrl", "foodInclusions", "decorInclusions", "furnitureInclusions", "serviceInclusions",
  "occasionSchemaVersion", "occasionScope", "occasionIds", "offerSchemaVersion",
  "sharedContractVersion", "idempotencyKey"];
const optionalFields = ["pricingModel", "equipmentInclusions", "foodChoiceGroups", "imageUrls",
  "balanceDueDaysBeforeEvent", "downPaymentPercentage"];
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v, (_key, value) =>
  value && typeof value === "object" && !Array.isArray(value) ?
    Object.fromEntries(Object.keys(value).sort().map((key) => [key,
      value[key]])) : value)).digest("hex");
function fail(reason: string,
  code: ConstructorParameters<typeof HttpsError>[0] = "failed-precondition"): never {
  throw new HttpsError(code, reason, {reason});
}
function revision(v: unknown): number {return positiveRevision(v, "CONFIG_UNAVAILABLE");}

/** Exact canonical envelope; every lifecycle, identity and discovery field is server-owned. */
export function parseV2DraftWrite(value: unknown, update: boolean) {
  const input = exact(value, [...baseFields, ...(update ? ["packageId", "expectedRevision"] : [])],
    optionalFields, "UNKNOWN_FIELD");
  if (input.sharedContractVersion !== 2) fail("CLIENT_UPGRADE_REQUIRED");
  mutationKey(input.idempotencyKey, "UNKNOWN_FIELD");
  if (update) {
    documentId(input.packageId, "UNKNOWN_FIELD");
    positiveRevision(input.expectedRevision, "UNKNOWN_FIELD");
  }
  const offer = parseOfferV2(Object.fromEntries(["offerSchemaVersion", "price", "serviceOptions",
    "serviceInclusions", "decorInclusions", "furnitureInclusions", "foodInclusions",
    "equipmentInclusions", "foodChoiceGroups", "pricingModel"].filter((key) => Object.hasOwn(input, key))
    .map((key) => [key, input[key]])));
  // Reuse existing capacity/payment/theme/media validation. The placeholder is
  // internal only: canonical occasion resolution below supplies the stored primary.
  const base = parseCanonicalPackageWrite({...input, eventType: "birthday",
    serviceOptions: Object.fromEntries(Object.entries(offer.serviceOptions).map(([tier, option]) =>
      [tier, {price: option!.price, includedServices: option!.includedServices}]))});
  assertCanonicalPackageServiceCategory(base);
  assertCanonicalPackagePaymentTerms(base);
  plainText(input.name, 2, 80, "INVALID_NAME");
  plainText(input.description, 10, 5000, "INVALID_NAME");
  if (input.balanceDueDaysBeforeEvent !== undefined && input.balanceDueDaysBeforeEvent !== null) {
    fail("SERVER_OWNED_FIELD", "invalid-argument");
  }
  if (input.imageUrls !== undefined && input.imageUrl !== base.imageUrl) {
    fail("INVALID_MEDIA_REFERENCE", "invalid-argument");
  }
  return {input, base, offer};
}

/** Deterministic conversion; never accepts a second client payload for saved progress. */
export function packageWriteFromProgress(progress: PackageEditorProgressV2) {
  const number = (value: unknown) => {
    if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
      fail("INCOMPLETE_EDITOR_PROGRESS", "invalid-argument");
    }
    return Number(value);
  };
  const options = Object.fromEntries(Object.entries(progress.tiers ?? {})
    .filter(([, row]) => row.enabled).map(([tier, raw]) => {
      const row = raw;
      return [tier, {price: number(row.priceText), includedServices: row.includedServices,
        decorInclusions: row.decorInclusions, furnitureInclusions: row.furnitureInclusions,
        equipmentInclusions: row.equipmentInclusions}];
    }));
  return {sharedContractVersion: 2, idempotencyKey: "internal_completion_key",
    name: progress.name, description: progress.description,
    serviceCategoryCode: progress.serviceCategoryCode, ...progress.occasion,
    offerSchemaVersion: 2, serviceOptions: options,
    ...(progress.pricingModel &&
      progress.pricingModel !== "legacy" ? {pricingModel: progress.pricingModel} : {}),
    price: progress.priceText === undefined ?
      Math.min(...Object.values(options).map((option) => option.price)) :
      number(progress.priceText),
    minimumGuests: number(progress.minimumGuestsText),
    maximumGuests: number(progress.maximumGuestsText), paymentPolicy: progress.paymentPolicy,
    depositPercentage: progress.paymentPolicy === "full_payment" ? 100 :
      number(progress.depositPercentageText),
    themeOptions: (progress.themes ?? []).map((theme) => ({id: theme.editorThemeId,
      name: theme.name, description: theme.description, imageUrls: []})),
    imageUrl: "", imageUrls: [],
    ...(progress.foodChoiceGroups?.length ? {foodChoiceGroups: progress.foodChoiceGroups} : {}),
    ...Object.fromEntries((["foodInclusions", "serviceInclusions", "decorInclusions",
      "furnitureInclusions", "equipmentInclusions"] as const).map((field) => [field,
        progress[field] ?? []]))};
}

/** Unfinished V2 writers are executable only in explicitly opted-in demo emulators. */
function isolatedDemo(): boolean {
  return process.env.FEASTA_V2_DRAFT_DEMO_ENABLED === "true" &&
    process.env.FUNCTIONS_EMULATOR === "true" &&
    /^demo-[a-z0-9-]+$/.test(process.env.GCLOUD_PROJECT || "") &&
    /^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "") &&
    /^127\.0\.0\.1:\d+$/.test(process.env.FIREBASE_AUTH_EMULATOR_HOST || "");
}

type Mode = "create" | "update" | "complete" | "publish";
function callable(mode: Mode) {
  return onCall({...appCheckCallableOptions, timeoutSeconds: 60, secrets: cloudinarySecrets},
    async (request) => {
    const actor = requireAuth(request);
    if (!request.app && !isolatedDemo()) fail("APP_CHECK_REQUIRED", "unauthenticated");
    if (!isolatedDemo()) fail("FEATURE_DISABLED");
    await requireRole(actor.uid, ["provider"]);
    await enforceCallableRateLimit(request,
      {scope: `packages.v2Draft.${mode === "complete" ? "create" : mode}`,
      limit: mode === "update" ? 60 : 20, windowSeconds: 3600});
    const envelope = mode === "complete" ? exact(request.data,
      ["editorDraftId", "expectedRevision", "expectedPackageRevision", "idempotencyKey"], [],
        "UNKNOWN_FIELD") : null;
    if (envelope) {
      documentId(envelope.editorDraftId, "UNKNOWN_FIELD");
      positiveRevision(envelope.expectedRevision, "UNKNOWN_FIELD");
      mutationKey(envelope.idempotencyKey, "UNKNOWN_FIELD");
      if (envelope.expectedPackageRevision !== null) fail("CLIENT_UPGRADE_REQUIRED");
    }
    const publication = mode === "publish" ? exact(request.data,
      ["packageId", "expectedRevision", "idempotencyKey", "sharedContractVersion"],
      [], "UNKNOWN_FIELD") : null;
    if (publication) {
      documentId(publication.packageId, "UNKNOWN_FIELD");
      positiveRevision(publication.expectedRevision, "UNKNOWN_FIELD");
      mutationKey(publication.idempotencyKey, "UNKNOWN_FIELD");
      if (publication.sharedContractVersion !== 2) fail("CLIENT_UPGRADE_REQUIRED");
    }
    const parsed = mode === "complete" || publication ? null :
      parseV2DraftWrite(request.data, mode === "update");
    const newRef = db.collection("packages").doc();
    let admittedBaseHash: string | null = null;
    // Both phases use the same complete authorization/validation path. Admission
    // performs no writes; the commit phase rereads all mutable authority and CAS
    // state after external verification. Never call Cloudinary in a retried tx.
    const runPhase = (admissionOnly: boolean) => db.runTransaction(async (tx) => {
      const user = (await tx.get(db.collection("users").doc(actor.uid))).data();
      if (resolveBackendAccountState({authDisabled: false, profile: user,
        allowedRoles: ["provider"]}).kind !== "active") {
        fail("ACCOUNT_ACCESS_DENIED", "permission-denied");
      }
      const providerId = documentId(user?.providerId, "CONFIG_UNAVAILABLE");
      const provider = authorizeProviderForPackageManagement({actorUid: actor.uid,
        providerSnapshot: await tx.get(db.collection("providers").doc(providerId))});
      const policy = (await tx.get(db.doc("contractPolicies/providerPackageV2"))).data();
      if (!policy || policy.effectiveEnvironment !== (process.env.GCLOUD_PROJECT ||
        process.env.GCP_PROJECT)) fail("CONFIG_UNAVAILABLE");
      revision(policy.revision);
      if (policy.featureGates?.packageDraftWrites !== true) fail("FEATURE_DISABLED");
      if (!Number.isSafeInteger(policy.maxSpecificOccasions) || policy.maxSpecificOccasions < 1 ||
          policy.maxSpecificOccasions > 100 || !Number.isSafeInteger(policy.maxThemeImages) ||
          policy.maxThemeImages < 1 || policy.maxThemeImages > 1000) fail("CONFIG_UNAVAILABLE");
      await requireMaintenanceOpen(tx, db, "publication");
      if (publication && (process.env.FEASTA_V2_PUBLICATION_DEMO_ENABLED !== "true" ||
          policy.featureGates?.packagePublication !== true ||
          policy.featureGates?.customerDiscovery !== true ||
          policy.featureGates?.customerBooking !== true)) fail("FEATURE_DISABLED");
      if (publication && !isProviderPubliclyEligible(
        {...provider.providerData, id: providerId}, user!)) fail("PROVIDER_INELIGIBLE");
      const key = (publication ?? envelope ?? parsed!.input).idempotencyKey;
      const opRef = db.collection("providerPackageV2Operations").doc(hash([actor.uid, mode, key]));
      const requestHash = hash(request.data);
      const prior = (await tx.get(opRef)).data();
      if (prior) {
        if (prior.actorUid !== actor.uid || prior.providerId !== providerId ||
          prior.requestHash !== requestHash) {
          fail("IDEMPOTENCY_CONFLICT", "already-exists");
        }
        return {kind: "replay" as const, result: prior.result};
      }
      const editorRef = envelope ? db.collection("providerPackageEditorDrafts")
        .doc(envelope.editorDraftId as string) : null;
      const editor = editorRef ? (await tx.get(editorRef)).data() : null;
      const quotaRef = db.collection("providerPackageEditorQuotas").doc(providerId);
      const quota = envelope ? (await tx.get(quotaRef)).data() : null;
      if (envelope) {
        if (!editor || editor.ownerUid !== actor.uid || editor.providerId !== providerId ||
            editor.editorSchemaVersion !== 2 || editor.packageId !== null ||
              editor.basePackageRevision !== null) {
          fail("RESOURCE_NOT_FOUND", "not-found");
        }
        if (editor.state !== "incomplete") fail("EDITOR_DRAFT_COMPLETED");
        if (editor.revision !== envelope.expectedRevision) fail("REVISION_CONFLICT", "aborted");
        if (!quota || !Number.isSafeInteger(quota.count) || quota.count < 1 ||
          quota.count > 20) fail("DRAFT_QUOTA_RECONCILIATION_REQUIRED");
      }
      const progress = envelope ? validatePackageEditorProgress(editor!.progress,
        {maxSpecificOccasions: policy.maxSpecificOccasions, maxThemeImages: Math.min(4,
          policy.maxThemeImages)}) : null;
      if (progress) assertNoUnverifiedEditorAssets(progress);
      const publishing = publication ? authorizeOwnedPackage({providerId,
        packageSnapshot: await tx.get(db.collection("packages")
          .doc(publication.packageId as string))}) : null;
      if (publishing) {
        assertDraftPackage(publishing);
        if (publishing.packageData.sharedContractVersion !== 2 ||
            publishing.packageData.revision !== publication!.expectedRevision ||
            publishing.packageData.isDeleted !== false ||
            publishing.packageData.isActive !== false ||
            publishing.packageData.isPublished !== false ||
            publishing.packageData.providerPubliclyVisible !== false ||
            publishing.packageData.publishedAt !== null) fail("REVISION_CONFLICT", "aborted");
      }
      const publishInput = publishing ? Object.fromEntries([...baseFields, ...optionalFields]
        .filter((field) => Object.hasOwn(publishing.packageData, field))
        .map((field) => [field, publishing.packageData[field]])) : null;
      const {input, base,
        offer} = parsed ?? (publishInput ? parseV2DraftWrite({...publishInput,
          idempotencyKey: publication!.idempotencyKey}, false) : parseV2DraftWrite(
          packageWriteFromProgress(progress as PackageEditorProgressV2), false));
      if (base.themeOptions.some((theme) => theme.imageUrls.length > Math.min(4,
        policy.maxThemeImages))) fail("INVALID_MEDIA_REFERENCE", "invalid-argument");
      const packageRef = publishing ? db.collection("packages")
        .doc(publication!.packageId as string) : mode === "update" ?
        db.collection("packages").doc(input.packageId as string) : newRef;
      const old = mode === "update" ? authorizeOwnedPackage({providerId,
        packageSnapshot: await tx.get(packageRef)}) : null;
      if (old) {
        assertDraftPackage(old);
        const data = old.packageData;
        if (data.sharedContractVersion !== 2 || data.occasionSchemaVersion !== 2 ||
          data.offerSchemaVersion !== 2 ||
            data.isDeleted !== false || data.isActive !== false || data.isPublished !== false ||
            data.providerPubliclyVisible !== false ||
              data.publishedAt !== null) fail("CLIENT_UPGRADE_REQUIRED");
        if (revision(data.revision) !== input.expectedRevision) fail("REVISION_CONFLICT",
          "aborted");
      }
      const catalog = (await tx.get(db.doc("occasionCatalog/current"))).data();
      if (catalog?.activationState !== "stable") fail("CONFIG_UNAVAILABLE");
      const authority = (await tx.get(db.collection("providerEligibilityAuthorities")
        .doc(providerId))).data();
      const approved = occasionIds(authority?.approvedOccasionIds);
      const category = base.serviceCategoryCode!;
      if (!Array.isArray(authority?.approvedCategoryCodes) ||
        !authority.approvedCategoryCodes.includes(category)) fail("INVALID_SERVICE_CATEGORY");
      await requireActiveServiceCategoryInTransaction(tx, category, "catering",
        "serviceCategoryCode");
      // A bounded full active-catalog read is required for Fits All completeness.
      const rows = await tx.get(db.collection("occasions").where("active", "==", true).limit(1001));
      if (rows.size > 1000) fail("CONFIG_UNAVAILABLE");
      const occasions = rows.docs.map((doc) => {
        projectPublicOccasionV2(doc.id, doc.data());
        return doc.data() as GlobalOccasion;
      });
      const occasion = resolveOccasionV2({occasionSchemaVersion: input.occasionSchemaVersion,
        occasionScope: input.occasionScope, occasionIds: input.occasionIds}, {
        catalog: occasions, approvedOccasionIds: approved, serviceCategoryCode: category,
        approvedActiveCategoryCodes: authority!.approvedCategoryCodes,
        catalogRevision: revision(catalog!.revision),
          providerEligibilityRevision: revision(authority!.revision),
        maxSpecificOccasions: policy.maxSpecificOccasions},
          (publishing ?? old)?.packageData.eventType as string | undefined);
      // Legacy capacity/category checks remain authoritative; explicit V2 sidecar
      // grants replace only the legacy scalar eventTypesSupported check.
      assertPackageMatchesProviderCapabilities({...provider.providerData,
        eventTypesSupported: approved}, {...base, eventType: occasion.eventType});
      const payment = (await tx.get(db.doc("appSettings/platform"))).data();
      assertPackagePaymentTermsWithinPolicy(base, packagePaymentPolicyBoundsFromData(payment));
      if (publishing) {
        for (const field of ["eventType", "occasionMatchIds", "occasionCatalogRevision",
          "providerEligibilityRevision", "occasionEligibilityState"] as const) {
          if (!isDeepStrictEqual(publishing.packageData[field], occasion[field])) {
            fail("STALE_DISCOVERY_MEMBERSHIP", "aborted");
          }
        }
      }
      const next = publishing ? revision(publishing.packageData.revision) + 1 :
        old ? revision(old.packageData.revision) + 1 : 1;
      if (!Number.isSafeInteger(next) || (editor &&
        !Number.isSafeInteger(editor.revision + 1))) fail("REVISION_CONFLICT", "aborted");
      if (admissionOnly) return {kind: "admitted" as const, base};
      if (publication && hash(base) !== admittedBaseHash) fail("REVISION_CONFLICT", "aborted");
      const now = Timestamp.now();
      const stored = {...base, ...offer, ...occasion, sharedContractVersion: 2,
        providerId, revision: next, paymentTermsSchemaVersion: 2,
        balanceDueHoursBeforeEvent: base.paymentPolicy === "deposit_then_balance" ?
          BALANCE_DUE_HOURS_BEFORE_EVENT : null,
        status: "draft", isActive: false, isPublished: false, providerPubliclyVisible: false,
        publishedAt: null, isDeleted: false, deletedAt: null, deletedBy: null, deletionReason: null,
        updatedAt: now, updatedBy: actor.uid};
      const discoveryProjection = {eventType: occasion.eventType,
        occasionMatchIds: occasion.occasionMatchIds,
        occasionCatalogRevision: occasion.occasionCatalogRevision,
          providerEligibilityRevision: occasion.providerEligibilityRevision,
        occasionEligibilityState: occasion.occasionEligibilityState};
      if (publication) {
        const result = {success: true, packageId: packageRef.id, packageRevision: next,
          sharedContractVersion: 2, status: "published"};
        tx.update(packageRef, {status: "published", isActive: true, isPublished: true,
          providerPubliclyVisible: true, publishedAt: now, updatedAt: now,
          updatedBy: actor.uid, revision: next});
        tx.create(opRef, {actorUid: actor.uid, providerId, requestHash, result, createdAt: now});
        recordMaintenanceAdmission(tx, db);
        return {kind: "committed" as const, result};
      }
      const result = envelope ? {editorDraftId: editorRef!.id,
        editorDraftRevision: editor!.revision + 1,
        packageId: packageRef.id, packageRevision: next, status: "draft"} :
        {success: true, packageId: packageRef.id, packageRevision: next, status: "draft",
          sharedContractVersion: 2, discoveryProjection};
      if (old) tx.update(packageRef, {...stored,
        // Full replacement must clear optional fields omitted by this request.
        ...Object.fromEntries((["pricingModel", "equipmentInclusions", "foodChoiceGroups", "imageUrls"] as const)
          .filter((field) => !Object.hasOwn(stored, field))
          .map((field) => [field, FieldValue.delete()]))});
      else tx.create(packageRef, {...stored, createdAt: now, createdBy: actor.uid});
      if (editorRef) {
        tx.update(editorRef, {state: "completed", completedPackageId: packageRef.id,
          completedPackageRevision: next, revision: editor!.revision + 1, updatedAt: now});
        tx.update(quotaRef, {count: quota!.count - 1, updatedAt: now});
      }
      tx.create(opRef, {actorUid: actor.uid, providerId, requestHash, result, createdAt: now});
      recordMaintenanceAdmission(tx, db);
      return {kind: "committed" as const, result};
    });
    if (parsed || publication) {
      const admission = await runPhase(true);
      if (admission.kind !== "admitted") return admission.result;
      // No retained-image exemption: every submitted URL is still verified.
      admittedBaseHash = hash(admission.base);
      await verifyPackageImages(admission.base, actor.uid);
      // Auth account disablement is external to Firestore; refresh it as well.
      await requireRole(actor.uid, ["provider"]);
    }
    const committed = await runPhase(false);
    if (committed.kind === "admitted") fail("CONFIG_UNAVAILABLE");
    return committed.result;
  });
}

// Exported for native demo acceptance; production execution remains hard-disabled.
export const createProviderPackageV2 = callable("create");
export const updateProviderPackageV2 = callable("update");
export const completeProviderPackageEditorDraft = callable("complete");

// Internal route of the existing publisher; deliberately absent from index.ts.
export const publishProviderPackageV2Internal = callable("publish");
