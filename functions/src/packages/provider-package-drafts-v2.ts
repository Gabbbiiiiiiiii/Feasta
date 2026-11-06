import {isDeepStrictEqual} from "node:util";
import {occasionDependencyEntryPath, validOccasionDependencyEntry} from "../admin/occasion-dependency-registry.js";
import {planSpecificPackageMembership} from "../admin/occasion-package-membership-plan.js";
import {occasionCategoryDependencyEntryPath, validOccasionCategoryDependencyEntry} from "../admin/occasion-category-dependency-registry.js";
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
import {resolveGlobalOccasionSelection} from "./global-occasion-selection-v3.js";
import {isGlobalPackageWriteVersion} from "./global-package-write-v3.js";
import {projectPublicOccasionV2} from "./provider-package-v2-public-occasion-contract.js";
import {exact, documentId, mutationKey, positiveRevision, plainText} from "./v2-validation.js";
import {EditorProgressError, validatePackageEditorProgress,
  assertNoUnverifiedEditorAssets} from "./package-editor-progress-v2.js";

const baseFields = ["name", "description", "serviceCategoryCode", "price", "serviceOptions",
  "themeOptions", "paymentPolicy", "depositPercentage", "minimumGuests", "maximumGuests",
  "imageUrl", "foodInclusions", "decorInclusions", "furnitureInclusions", "serviceInclusions",
  "occasionSchemaVersion", "occasionScope", "occasionIds", "offerSchemaVersion",
  "sharedContractVersion", "idempotencyKey"];
const optionalFields = ["pricingModel", "offerStructure", "packageStyle", "equipmentInclusions", "foodChoiceGroups", "imageUrls",
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

/**
 * Translate known global-selection validation failures into callable errors.
 * Unexpected exceptions remain unexpected: do not disguise programming faults.
 */
function resolveGlobalOccasionForCallable(
  ...args: Parameters<typeof resolveGlobalOccasionSelection>
): ReturnType<typeof resolveGlobalOccasionSelection> {
  try {
    return resolveGlobalOccasionSelection(...args);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INVALID_OCCASION_SELECTION") {
        fail("INVALID_OCCASION_SELECTION", "invalid-argument");
      }
      if (error.message === "PROVIDER_OCCASION_INELIGIBLE") {
        fail("PROVIDER_OCCASION_INELIGIBLE", "failed-precondition");
      }
      if (error.message === "CONFIG_UNAVAILABLE") {
        fail("CONFIG_UNAVAILABLE", "failed-precondition");
      }
    }
    throw error;
  }
}
/** Exact canonical envelope; every lifecycle, identity and discovery field is server-owned. */
export function parseV2DraftWrite(value: unknown, update: boolean) {
  // V3 shares canonical package field validation with V2.
  // V3 write admission remains separately disabled.
  if (value !== null && typeof value === "object" && !Array.isArray(value) &&
      (value as Record<string, unknown>).sharedContractVersion === 3 &&
      !isGlobalPackageWriteVersion(value)) {
    fail("INVALID_OCCASION_SELECTION", "invalid-argument");
  }
  const input = exact(value, [...baseFields, ...(update ? ["packageId", "expectedRevision"] : [])],
    optionalFields, "UNKNOWN_FIELD");
  if (input.sharedContractVersion !== 2 &&
      input.sharedContractVersion !== 3) {
    fail("CLIENT_UPGRADE_REQUIRED");
  }
  if (input.offerStructure !== undefined &&
      !["fixed", "customizable", "individual"].includes(
        input.offerStructure as string)) {
    fail("INVALID_OFFER_STRUCTURE", "invalid-argument");
  }
  // Individual food is editor-only. Its serving-price contract is not a
  // canonical package/booking contract; never drop it during completion.
  if (input.offerStructure === "individual") fail("INDIVIDUAL_FOOD_PACKAGE_UNSUPPORTED");
  if (input.packageStyle !== undefined) {
    if (typeof input.packageStyle !== "string" ||
        input.packageStyle !== input.packageStyle.trim() ||
        [...input.packageStyle].length < 2 ||
        [...input.packageStyle].length > 80) {
      fail("INVALID_PACKAGE_STYLE", "invalid-argument");
    }
    plainText(input.packageStyle, 2, 80, "INVALID_NAME");
  }
  mutationKey(input.idempotencyKey, "UNKNOWN_FIELD");
  if (update) {
    documentId(input.packageId, "UNKNOWN_FIELD");
    positiveRevision(input.expectedRevision, "UNKNOWN_FIELD");
  }
  const offer = parseOfferV2(Object.fromEntries(["offerSchemaVersion", "price", "serviceOptions",
    "serviceInclusions", "decorInclusions", "furnitureInclusions", "foodInclusions",
    "equipmentInclusions", "foodChoiceGroups", "pricingModel"].filter((key) => Object.hasOwn(input, key))
    .map((key) => [key, input[key]])));
  if (input.offerStructure === "customizable" &&
      (!offer.foodChoiceGroups?.length || !offer.pricingModel)) {
    fail("INVALID_FOOD_CHOICE_GROUP", "invalid-argument");
  }
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

export {individualCanonicalPricingFromProgress} from "./individual-package-draft-write-v1.js";
/** Deterministic conversion; never accepts a second client payload for saved progress. */
export function packageWriteFromProgress(progress: PackageEditorProgressV2) {
  if (progress.offerStructure === "individual" || Object.hasOwn(progress, "individualFoodDraft") || Object.hasOwn(progress, "individualFoodItems")) {
    fail("INDIVIDUAL_FOOD_PACKAGE_UNSUPPORTED");
  }
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
    ...(progress.offerStructure !== undefined ?
      {offerStructure: progress.offerStructure} : {}),
    ...(progress.packageStyle !== undefined ?
      {packageStyle: progress.packageStyle} : {}),
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

/** Demo admission remains separate from the production customizable draft contract. */
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
    if (mode === "publish" && !isolatedDemo()) fail("FEATURE_DISABLED");
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
      const providerSnapshot = await tx.get(db.collection("providers").doc(providerId));
      if (!publication && providerSnapshot.data()?.isBlocked === true) {
        fail("ACCOUNT_ACCESS_DENIED", "permission-denied");
      }
      if (!["approved", "verified"].includes(providerSnapshot.data()?.verificationStatus)) {
        fail("PROVIDER_NOT_APPROVED");
      }
      const provider = authorizeProviderForPackageManagement({actorUid: actor.uid,
        providerSnapshot});
      const policy = (await tx.get(db.doc("contractPolicies/providerPackageV2"))).data();
      if (!policy || policy.effectiveEnvironment !== (process.env.GCLOUD_PROJECT ||
        process.env.GCP_PROJECT)) fail("CONFIG_UNAVAILABLE");
      revision(policy.revision);
      if (policy.featureGates?.packageDraftWrites !== true) fail("FEATURE_DISABLED");

      // V3 private drafts require an additional explicit local demo opt-in.
      // V3 remains demo-only even when production V2 draft writes are enabled.
      // The existing V2 feature gate cannot activate V3 on its own.
      if (parsed?.input.sharedContractVersion === 3 &&
          (!isolatedDemo() || process.env.FEASTA_V3_PRIVATE_DRAFT_DEMO_ENABLED !== "true")) {
        fail("FEATURE_DISABLED");
      }
      if (!Number.isSafeInteger(policy.maxSpecificOccasions) || policy.maxSpecificOccasions < 1 ||
          policy.maxSpecificOccasions > 100 || !Number.isSafeInteger(policy.maxThemeImages) ||
          policy.maxThemeImages < 1 || policy.maxThemeImages > 1000) fail("CONFIG_UNAVAILABLE");
      const editorRef = envelope ? db.collection("providerPackageEditorDrafts")
        .doc(envelope.editorDraftId as string) : null;
      const editor = editorRef ? (await tx.get(editorRef)).data() : null;
      // This scopes maintenance only; full authorization and validation below
      // still precede every new write. Publication keeps its maintenance gate.
      const privateCustomizableDraft = !publication && (parsed ?
        parsed.input.sharedContractVersion === 2 &&
          parsed.input.offerStructure === "customizable" :
        editor?.editorSchemaVersion === 2 && editor?.ownerUid === actor.uid &&
          editor?.providerId === providerId && editor?.packageId === null &&
          editor?.basePackageRevision === null &&
          editor?.progress?.offerStructure === "customizable");
      if (!privateCustomizableDraft) await requireMaintenanceOpen(tx, db, "publication");
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
      const quotaRef = db.collection("providerPackageEditorQuotas").doc(providerId);
      const quota = envelope ? (await tx.get(quotaRef)).data() : null;
      if (envelope) {
        if (!editor || editor.ownerUid !== actor.uid || editor.providerId !== providerId ||
            editor.editorSchemaVersion !== 2 || editor.packageId !== null ||
              editor.basePackageRevision !== null) {
          fail("RESOURCE_NOT_FOUND", "not-found");
        }
        if (editor.state !== "incomplete") fail("EDITOR_DRAFT_COMPLETED");
        if ((editor.mediaCleanupPendingCount ?? 0) !== 0 || editor.mediaPromotionOperationId) {
          fail("EDITOR_DRAFT_MEDIA_BUSY");
        }
        if (editor.revision !== envelope.expectedRevision) fail("REVISION_CONFLICT", "aborted");
        if (!quota || !Number.isSafeInteger(quota.count) || quota.count < 1 ||
          quota.count > 20) fail("DRAFT_QUOTA_RECONCILIATION_REQUIRED");
      }
      let progress: ReturnType<typeof validatePackageEditorProgress> | null = null;
      try {
        progress = envelope ? validatePackageEditorProgress(editor!.progress,
          {maxSpecificOccasions: policy.maxSpecificOccasions,
            maxThemeImages: Math.min(4, policy.maxThemeImages)}) : null;
        if (progress) assertNoUnverifiedEditorAssets(progress);
      } catch (error) {
        if (error instanceof EditorProgressError) {
          throw new HttpsError(error.reason === "CLIENT_UPGRADE_REQUIRED" ?
            "failed-precondition" : "invalid-argument", error.reason,
          {reason: error.reason, ...(error.reason === "CLIENT_UPGRADE_REQUIRED" ?
            {field: "media", step: 4} : {})});
        }
        throw error;
      }
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
      // Production admission is deliberately limited to validated V2 customizable
      // private drafts. Fixed/V3 demo behavior is unchanged.
      if (!isolatedDemo() && (input.sharedContractVersion !== 2 ||
          input.offerStructure !== "customizable")) fail("FEATURE_DISABLED");
      if (publication && (input.offerStructure === "customizable" ||
          offer.foodChoiceGroups?.length || offer.pricingModel !== undefined)) {
        fail("FEATURE_DISABLED");
      }
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
        // Updates must retain the persisted occasion-contract version.
        // No implicit V2/V3 migration is permitted.
        if (data.sharedContractVersion !== input.sharedContractVersion ||
            data.occasionSchemaVersion !== 2 ||
            data.offerSchemaVersion !== 2 ||
            data.isDeleted !== false || data.isActive !== false ||
            data.isPublished !== false ||
            data.providerPubliclyVisible !== false ||
            data.publishedAt !== null) {
          fail("CLIENT_UPGRADE_REQUIRED");
        }
        if (input.sharedContractVersion === 3) {
          if (data.occasionEligibilityModel !== "global_v1" ||
              data.globalEligibilityContractVersion !== 1 ||
              Object.hasOwn(data, "providerEligibilityRevision")) {
            fail("CLIENT_UPGRADE_REQUIRED");
          }
        } else if (data.occasionEligibilityModel === "global_v1" ||
            Object.hasOwn(data, "globalEligibilityContractVersion")) {
          fail("CLIENT_UPGRADE_REQUIRED");
        }
        if (revision(data.revision) !== input.expectedRevision) fail("REVISION_CONFLICT",
          "aborted");
      }
      const catalog = (await tx.get(db.doc("occasionCatalog/current"))).data();
      if (catalog?.activationState !== "stable") fail("CONFIG_UNAVAILABLE");

      const category = base.serviceCategoryCode!;
      const isGlobal = input.sharedContractVersion === 3;

      if (!Array.isArray(provider.providerData.serviceCategories) ||
          !provider.providerData.serviceCategories.includes(category)) {
        fail("INVALID_SERVICE_CATEGORY");
      }
      // Service-category authorization is required for both contracts.
      await requireActiveServiceCategoryInTransaction(
        tx, category, "catering", "serviceCategoryCode");

      // Protected grants remain mandatory for publication only.
      // Neither missing nor existing sidecars control private draft permission.
      const privateDraft = !publication && !isGlobal;
      const authority = isGlobal || privateDraft ? null : (await tx.get(
        db.collection("providerEligibilityAuthorities").doc(providerId)
      )).data();

      if (!isGlobal && !privateDraft && (!authority || authority.approvedOccasionIds === undefined ||
          authority.approvedCategoryCodes === undefined)) {
        fail("PROVIDER_OCCASION_APPROVAL_REQUIRED");
      }
      const approved = isGlobal || privateDraft ? [] : occasionIds(authority?.approvedOccasionIds);

      if (!isGlobal && !privateDraft &&
          (!Array.isArray(authority?.approvedCategoryCodes) ||
           !authority.approvedCategoryCodes.includes(category))) {
        fail("INVALID_SERVICE_CATEGORY");
      }

      // Read the complete active catalog within the same transaction.
      const catalogLimit = isGlobal ? 201 : 1001;
      const maximum = isGlobal ? 200 : 1000;

      const rows = await tx.get(
        db.collection("occasions").where("active", "==", true).limit(catalogLimit)
      );

      if (rows.size > maximum) fail("CONFIG_UNAVAILABLE");

      const occasions = rows.docs.map((doc) => {
        const data = doc.data();
        projectPublicOccasionV2(doc.id, data);
        if (data.id !== doc.id) fail("CONFIG_UNAVAILABLE");
        return data as GlobalOccasion;
      });

      const occasion = isGlobal ?
        resolveGlobalOccasionForCallable({
          occasionSchemaVersion: 2,
          occasionScope: input.occasionScope as "specific" | "all",
          occasionIds: input.occasionIds as string[],
        }, {
          catalog: occasions,
          catalogRevision: revision(catalog!.revision),
          provider: provider.providerData,
          serviceCategoryCode: category,
          maxSpecificOccasions: policy.maxSpecificOccasions,
          activeServiceCategoryCodes: [category],
        }, (publishing ?? old)?.packageData.eventType as string | undefined) :
        resolveOccasionV2({
          occasionSchemaVersion: input.occasionSchemaVersion,
          occasionScope: input.occasionScope,
          occasionIds: input.occasionIds,
        }, {
          catalog: occasions,
          approvedOccasionIds: approved,
          serviceCategoryCode: category,
          approvedActiveCategoryCodes: privateDraft ?
            (Array.isArray(provider.providerData.serviceCategories) ?
              provider.providerData.serviceCategories : []) : authority!.approvedCategoryCodes,
          ...(privateDraft ? {eligibilityMode: "global" as const} : {}),
          catalogRevision: revision(catalog!.revision),
          // V2 wire compatibility only; private flags and publication revalidation
          // prevent this placeholder from conferring protected authority.
          providerEligibilityRevision: privateDraft ? 1 : revision(authority!.revision),
          maxSpecificOccasions: policy.maxSpecificOccasions,
        }, (publishing ?? old)?.packageData.eventType as string | undefined);

      // Preserve legacy capacity/category checks. Global selections
      // derive eligible event types from the verified catalog instead
      // of a per-provider occasion grant.
      assertPackageMatchesProviderCapabilities({
        ...provider.providerData,
        eventTypesSupported: isGlobal || privateDraft ? occasion.occasionMatchIds : approved,
      }, {
        ...base,
        eventType: occasion.eventType,
      });
      const payment = (await tx.get(db.doc("appSettings/platform"))).data();
      assertPackagePaymentTermsWithinPolicy(base, packagePaymentPolicyBoundsFromData(payment));
      if (publishing) {
        // The existing publisher accepts legacy V2 authority only.
        // Global V3 publication remains disabled.
        if (isGlobal || !("providerEligibilityRevision" in occasion)) {
          fail("FEATURE_DISABLED");
        }
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
      // Provisional registry: never use it alone to authorize deactivation.
      // Reads occur only during commit, before any transaction writes.
      // Temporarily block scope/category transitions until registry
      // reconciliation can update all affected dependency witnesses.
      if (!publication && old &&
          (old.packageData.occasionScope !== occasion.occasionScope ||
           old.packageData.serviceCategoryCode !== category)) {
        throw new Error("OCCASION_REGISTRY_TRANSITION_UNSUPPORTED");
      }
      const registryChanges: {
        ref: FirebaseFirestore.DocumentReference;
        action: "create" | "delete";
        entry?: {
          schemaVersion: 1;
          kind: "package";
          occasionId: string;
          sourceId: string;
          sourcePath: string;
        };
      }[] = [];

      if (!publication &&
          input.occasionScope === "specific" &&
          (!old || old.packageData.occasionScope === "specific")) {
        const membership = planSpecificPackageMembership({
          previous: old ? old.packageData : null,
          next: {
            occasionSchemaVersion: occasion.occasionSchemaVersion,
            occasionScope: occasion.occasionScope,
            occasionIds: occasion.occasionIds,
            occasionMatchIds: occasion.occasionMatchIds,
            eventType: occasion.eventType,
          },
        });

        const allIds = [...new Set([
          ...membership.add,
          ...membership.remove,
          ...membership.retain,
        ])].sort();

        const snapshots = await Promise.all(allIds.map(async occasionId => {
          const entry = {
            schemaVersion: 1 as const,
            kind: "package" as const,
            occasionId,
            sourceId: packageRef.id,
            sourcePath: packageRef.path,
          };
          const ref = db.doc(occasionDependencyEntryPath(entry));
          const snapshot = await tx.get(ref);
          return {occasionId, entry, ref, snapshot};
        }));

        for (const {occasionId, entry, ref, snapshot} of snapshots) {
          if (snapshot.exists) {
            const data = snapshot.data();
            if (!validOccasionDependencyEntry(data) ||
                data.kind !== entry.kind ||
                data.occasionId !== entry.occasionId ||
                data.sourceId !== entry.sourceId ||
                data.sourcePath !== entry.sourcePath) {
              throw new Error("OCCASION_DEPENDENCY_ENTRY_INVALID");
            }
          }

          if (membership.remove.includes(occasionId)) {
            if (snapshot.exists) {
              registryChanges.push({ref, action: "delete"});
            }
          } else if (!snapshot.exists) {
            registryChanges.push({ref, action: "create", entry});
          }
        }
      }

      // Universal packages depend on their category, not only the
      // occasion IDs currently listed in the discovery projection.
      // Category registry remains provisional until historical
      // completeness and Admin transition authority are verified.
      const categoryRegistryChanges: {
        ref: FirebaseFirestore.DocumentReference;
        action: "create" | "delete";
        entry?: {
          schemaVersion: 1;
          kind: "universal_package";
          categoryCode: string;
          sourceId: string;
          sourcePath: string;
        };
      }[] = [];

      if (!publication &&
          occasion.occasionScope === "all" &&
          (!old || old.packageData.occasionScope === "all")) {
        const entry = {
          schemaVersion: 1 as const,
          kind: "universal_package" as const,
          categoryCode: category,
          sourceId: packageRef.id,
          sourcePath: packageRef.path,
        };
        const ref = db.doc(occasionCategoryDependencyEntryPath(entry));
        const snapshot = await tx.get(ref);

        if (snapshot.exists) {
          const data = snapshot.data();
          if (!validOccasionCategoryDependencyEntry(data) ||
              data.categoryCode !== entry.categoryCode ||
              data.sourceId !== entry.sourceId ||
              data.sourcePath !== entry.sourcePath) {
            throw new Error("OCCASION_CATEGORY_DEPENDENCY_ENTRY_INVALID");
          }
        } else {
          categoryRegistryChanges.push({ref, action: "create", entry});
        }
      }

      const now = Timestamp.now();
      // Optional metadata; never controls pricing, occasion authority or booking.
      // Preserve classifications from older drafts on updates that omit them.
      const classification = {
        ...(input.offerStructure !== undefined ?
          {offerStructure: input.offerStructure} :
          old?.packageData.offerStructure !== undefined ?
            {offerStructure: old.packageData.offerStructure} : {}),
        ...(input.packageStyle !== undefined ?
          {packageStyle: input.packageStyle} :
          old?.packageData.packageStyle !== undefined ?
            {packageStyle: old.packageData.packageStyle} : {}),
      };
      const stored = {...base, ...offer, ...occasion, ...classification,
        sharedContractVersion: isGlobal ? 3 : 2,
        providerId, revision: next, paymentTermsSchemaVersion: 2,
        balanceDueHoursBeforeEvent: base.paymentPolicy === "deposit_then_balance" ?
          BALANCE_DUE_HOURS_BEFORE_EVENT : null,
        status: "draft", isActive: false, isPublished: false, providerPubliclyVisible: false,
        publishedAt: null, isDeleted: false, deletedAt: null, deletedBy: null, deletionReason: null,
        updatedAt: now, updatedBy: actor.uid};
      const discoveryProjection = {
        eventType: occasion.eventType,
        occasionMatchIds: occasion.occasionMatchIds,
        occasionCatalogRevision: occasion.occasionCatalogRevision,
        ...("providerEligibilityRevision" in occasion ?
          {providerEligibilityRevision: occasion.providerEligibilityRevision} :
          {
            occasionEligibilityModel: "global_v1" as const,
            globalEligibilityContractVersion: 1 as const,
          }),
        occasionEligibilityState: occasion.occasionEligibilityState,
      };
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
          sharedContractVersion: isGlobal ? 3 : 2, discoveryProjection};
      // Apply only the registry changes validated above.
      // The registry remains non-authoritative until coverage is verified.
      for (const change of registryChanges) {
        if (change.action === "delete") {
          tx.delete(change.ref);
        } else {
          tx.create(change.ref, change.entry!);
        }
      }

      // Category-wide witnesses protect universal package dependencies.
      // They do not independently authorize occasion deactivation.
      for (const change of categoryRegistryChanges) {
        if (change.action === "delete") {
          tx.delete(change.ref);
        } else {
          tx.create(change.ref, change.entry!);
        }
      }

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
      if (!privateCustomizableDraft) recordMaintenanceAdmission(tx, db);
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

// Production supports only customizable V2 private drafts; policy admission is mandatory.
export const createProviderPackageV2 = callable("create");
export const updateProviderPackageV2 = callable("update");
export const completeProviderPackageEditorDraft = callable("complete");

// Internal route of the existing publisher; deliberately absent from index.ts.
export const publishProviderPackageV2Internal = callable("publish");
