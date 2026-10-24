import "server-only";

import {FieldPath, FieldValue} from "firebase-admin/firestore";
import {adminDb} from "@/lib/firebase/admin";
import {requireApprovedProvider, requireProviderCatalogAccess} from "@/lib/auth/session";
import {isPublicProviderRecord} from "@/lib/customer/providers/provider-normalization";
import {providerContentCapabilities} from "./provider-content-capabilities";
import {CATALOG_IMAGE_BYTES} from "./catalog-media";
import {menuAssetPublicId} from "./provider-menu";
import {parseProviderSetups, PROVIDER_SETUP_LIMIT} from "./provider-setup-gallery";
import {
  parsePrivateProviderSetups,
  resolveSetupGalleryV2,
  type ProviderSetupV2,
  type SetupGalleryAuthority,
  type SetupGalleryOccasion,
} from "./provider-setup-gallery-v2";

/**
 * Phase B2B internal implementation. Neither this method nor the policy can
 * activate private V2 writes until privileged writer coverage AND the public
 * V1 projection have been independently verified. Server actions use this adapter without enabling its release gates.
 */
const PRIVATE_V2_WRITER_COVERAGE_VERIFIED = false;
const MIXED_GALLERY_PUBLIC_V1_COMPATIBILITY_VERIFIED = false;
// A separate approval is required before exposing published V2 records.
const PRIVATE_V2_PUBLICATION_VERIFIED = false;

const POLICY_PATH = "contractPolicies/setupGalleryV2";
const AUTHORITY_COLLECTION = "providerEligibilityAuthorities";
const OCCASION_ID = /^[a-z][a-z0-9_]{1,63}$/u;

export type SavePrivateSetupGalleryV2Request = {
  galleryWriteSchemaVersion: 2;
  revision: number;
  expectedCatalogRevision: number;
  expectedProviderEligibilityRevision: number;
  setups: unknown;
};

type Policy = {
  privateWrites: boolean;
  publicReads: boolean;
  revision: number;
  maxSpecificOccasions: number;
  maxApplicableOccasions: number;
  maxCatalogRecords: number;
  pageSize: number;
  maxPages: number;
};

type SavedSetup = ReturnType<typeof parsePrivateProviderSetups>[number];

function deny(reason: string): never {
  throw new Error(reason);
}

function positive(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) ||
    value < 1 || value > max) return deny("Setup Gallery V2 authority unavailable.");
  return value;
}

function safeGalleryRevision(value: unknown): number {
  if (value === undefined) return 0;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return deny("Stored Setup Gallery revision is invalid.");
  }
  return value;
}

function exactRequest(value: unknown): SavePrivateSetupGalleryV2Request {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return deny("Invalid private gallery request.");
  }
  const v = value as Record<string, unknown>;
  const fields = ["galleryWriteSchemaVersion", "revision",
    "expectedCatalogRevision", "expectedProviderEligibilityRevision", "setups"];
  if (Object.keys(v).some((key) => !fields.includes(key)) ||
    fields.some((key) => !Object.hasOwn(v, key)) ||
    v.galleryWriteSchemaVersion !== 2 ||
    !Number.isSafeInteger(v.revision) || (v.revision as number) < 0 ||
    !Array.isArray(v.setups) || v.setups.length > PROVIDER_SETUP_LIMIT) {
    return deny("Invalid private gallery request.");
  }
  positive(v.expectedCatalogRevision);
  positive(v.expectedProviderEligibilityRevision);
  return v as SavePrivateSetupGalleryV2Request;
}

function currentProject(): string {
  const project = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!project || !/^[a-z][a-z0-9-]{5,62}$/u.test(project)) {
    return deny("Setup Gallery V2 configuration is unavailable.");
  }
  return project;
}

function parsePolicy(raw: unknown, project: string, loading = false): Policy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return deny("Setup Gallery V2 policy is unavailable.");
  }
  const p = raw as Record<string, unknown>;
  const keys = ["revision", "effectiveEnvironment", "validFromMillis",
    "validUntilMillis", "privateWrites", "publicReads", "maxSpecificOccasions",
    "maxApplicableOccasions", "maxCatalogRecords", "pageSize", "maxPages",
    "requireCurrentRevisions", "requireValidEligibility"];
  if (Object.keys(p).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.hasOwn(p, key)) ||
    p.effectiveEnvironment !== project || typeof p.privateWrites !== "boolean" ||
    typeof p.publicReads !== "boolean" || (!loading && p.privateWrites !== true) || p.requireCurrentRevisions !== true ||
    p.requireValidEligibility !== true) {
    return deny("Setup Gallery V2 policy is disabled or invalid.");
  }
  const start = positive(p.validFromMillis);
  const end = positive(p.validUntilMillis);
  const now = Date.now();
  if (now < start || now >= end) return deny("Setup Gallery V2 policy expired.");
  const policy = {
    revision: positive(p.revision),
    privateWrites: p.privateWrites as boolean,
    publicReads: p.publicReads as boolean,
    maxSpecificOccasions: positive(p.maxSpecificOccasions, 10),
    maxApplicableOccasions: positive(p.maxApplicableOccasions, 1000),
    maxCatalogRecords: positive(p.maxCatalogRecords, 2000),
    pageSize: positive(p.pageSize, 100),
    maxPages: positive(p.maxPages, 100),
  };
  if (policy.maxSpecificOccasions > policy.maxApplicableOccasions ||
    policy.maxApplicableOccasions > policy.maxCatalogRecords) {
    return deny("Setup Gallery V2 policy limits are invalid.");
  }
  return policy;
}

function distinctIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((id) =>
    typeof id !== "string" || !OCCASION_ID.test(id)) ||
    new Set(value).size !== value.length) {
    return deny("Provider occasion authority is invalid.");
  }
  return value as string[];
}

function existingPhotos(setups: SavedSetup[]): Set<string> {
  return new Set(setups.flatMap((setup) => setup.imageUrls));
}

async function verifyNewImage(url: string, ownerId: string): Promise<void> {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const id = menuAssetPublicId(url, ownerId);
  if (!cloudName || !apiKey || !apiSecret || !id) {
    return deny("Setup image verification is unavailable.");
  }
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}` +
      `/resources/image/upload/${encodeURIComponent(id)}`,
    {headers: {Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`)
      .toString("base64")}`}, cache: "no-store", signal: AbortSignal.timeout(15000)},
  );
  if (!response.ok) return deny("The setup image could not be verified.");
  const metadata: unknown = await response.json();
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return deny("Invalid setup image.");
  }
  const r = metadata as Record<string, unknown>;
  if (r.public_id !== id || r.secure_url !== url || r.resource_type !== "image" ||
    typeof r.bytes !== "number" || !Number.isSafeInteger(r.bytes) ||
    r.bytes <= 0 || r.bytes > CATALOG_IMAGE_BYTES ||
    !["jpg", "jpeg", "png", "webp"].includes(String(r.format))) {
    return deny("Invalid setup image.");
  }
}

/**
 * Intentionally unreachable until B2A.3 writer coverage, mixed V1/V2 public
 * projection, and private policy activation have been completed and tested.
 * All authoritative reads occur in the SAME Firestore transaction as the write.
 */
export type PrivateSetupGalleryV2 = {
  galleryWriteSchemaVersion: 2;
  revision: number;
  setups: SavedSetup[];
  authority: SetupGalleryAuthority;
  availability: {canSave: boolean; canPublishV2: false; reason: string | null};
};

export async function loadPrivateProviderSetupGalleryV2(input: unknown): Promise<PrivateSetupGalleryV2> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    Object.keys(input).length !== 1 ||
    (input as Record<string, unknown>).galleryWriteSchemaVersion !== 2) {
    return deny("Invalid private gallery request.");
  }
  return executePrivateGallery(input, true);
}

export async function savePrivateProviderSetupGalleryV2(rawInput: unknown): Promise<PrivateSetupGalleryV2> {
  return executePrivateGallery(rawInput, false);
}

async function executePrivateGallery(rawInput: unknown, loading: boolean): Promise<PrivateSetupGalleryV2> {
  if (!loading && (!PRIVATE_V2_WRITER_COVERAGE_VERIFIED ||
    !MIXED_GALLERY_PUBLIC_V1_COMPATIBILITY_VERIFIED)) {
    return deny("Private Setup Gallery V2 saving is disabled.");
  }
  const input = loading ? null : exactRequest(rawInput);
  const account = loading ? await requireProviderCatalogAccess() : await requireApprovedProvider();
  const provider = account.provider;
  const providerId = provider?.id;
  if (!provider || !providerId || !providerContentCapabilities(
    provider.providerServiceType, provider.serviceCategories).catering) {
    return deny("A verified catering provider is required.");
  }
  const providerRef = adminDb.collection("providers").doc(providerId);
  const galleryRef = providerRef.collection("catalog").doc("setups");
  const userRef = adminDb.collection("users").doc(account.uid);
  const eligibilityRef = adminDb.collection(AUTHORITY_COLLECTION).doc(providerId);
  const catalogRef = adminDb.collection("occasionCatalog").doc("current");
  const policyRef = adminDb.doc(POLICY_PATH);
  const project = currentProject();

  // Image checks happen outside the Firestore retrying transaction. A trusted
  // gallery snapshot is re-read inside the transaction to fence any race.
  const imageVerified = new Set<string>();
  if (input) {
    const preflight = (await galleryRef.get()).data();
    const old = parsePrivateProviderSetups(preflight?.setups, account.uid, 10);
    const preflightUrls = existingPhotos(old);
    for (const candidate of input.setups as Record<string, unknown>[]) {
      if (!candidate || typeof candidate !== "object" ||
        !Array.isArray(candidate.imageUrls)) {
        return deny("Invalid setup images.");
      }
      for (const url of candidate.imageUrls) {
        if (typeof url !== "string") return deny("Invalid setup image.");
        if (!preflightUrls.has(url) && !imageVerified.has(url)) {
          await verifyNewImage(url, account.uid);
          imageVerified.add(url);
        }
      }
    }

  }
  return adminDb.runTransaction(async (tx) => {
    const [userSnap, providerSnap, gallerySnap, eligibilitySnap,
      catalogSnap, policySnap] = await Promise.all([
      tx.get(userRef), tx.get(providerRef), tx.get(galleryRef),
      tx.get(eligibilityRef), tx.get(catalogRef), tx.get(policyRef),
    ]);
    const provider = providerSnap.data();
    const user = userSnap.data();
    if (!provider || provider.ownerId !== account.uid ||
      (!loading && provider.verificationStatus !== "approved") || provider.isActive !== true ||
      provider.isBlocked === true || provider.isSuspended === true || provider.isDeleted === true ||
      user?.role !== "provider" || user.providerId !== providerId ||
      user.accountStatus !== "active" || user.isBlocked === true ||
      user.isActive === false ||
      !providerContentCapabilities(provider.providerServiceType,
        Array.isArray(provider.serviceCategories) ? provider.serviceCategories : [])
        .catering) return deny("Provider is not eligible to edit this gallery.");

    const policy = parsePolicy(policySnap.data(), project, loading);
    const catalogRevision = positive(catalogSnap.data()?.revision);
    if (catalogSnap.data()?.activationState !== "stable") {
      return deny("Occasion catalog is not stable.");
    }
    const eligibilityRevision = positive(eligibilitySnap.data()?.revision);
    if (input && (catalogRevision !== input.expectedCatalogRevision ||
      eligibilityRevision !== input.expectedProviderEligibilityRevision)) {
      return deny("Setup Gallery V2 authority changed. Reload before saving.");
    }
    const current = gallerySnap.data();
    if (current && ((current.galleryWriteSchemaVersion !== undefined &&
      current.galleryWriteSchemaVersion !== 1 && current.galleryWriteSchemaVersion !== 2) ||
      (current.providerId !== undefined && current.providerId !== providerId))) {
      return deny("Stored Setup Gallery metadata is invalid.");
    }
    const revision = safeGalleryRevision(current?.revision);
    if (input && (revision !== input.revision || revision === Number.MAX_SAFE_INTEGER)) {
      return deny("Setup gallery changed. Reload before saving.");
    }
    const previous = parsePrivateProviderSetups(
      current?.setups, account.uid, policy.maxSpecificOccasions);
    const previousById = new Map(previous.map((setup) => [setup.id, setup]));
    const currentPhotos = existingPhotos(previous);
    const categories = provider.serviceCategories;
    if (!Array.isArray(categories) || !categories.length ||
      categories.length > 50 || categories.some((code) =>
        typeof code !== "string" || !OCCASION_ID.test(code)) ||
      new Set(categories).size !== categories.length) {
      return deny("Invalid provider service categories.");
    }
    const categoryDocs = await Promise.all(categories.map((code: string) =>
      tx.get(adminDb.collection("serviceCategories").doc(code))));
    const activeCatering: string[] = [];
    for (let i = 0; i < categories.length; i++) {
      const category = categoryDocs[i]?.data();
      if (!category || category.code !== categories[i] ||
        category.status !== "active" ||
        (category.serviceType !== "catering" && category.serviceType !== "addon")) {
        return deny("Provider service categories require review.");
      }
      if (category.serviceType === "catering") activeCatering.push(categories[i]);
    }
    const approvedCategories = distinctIds(eligibilitySnap.data()?.approvedCategoryCodes);
    const approvedOccasionIds = distinctIds(eligibilitySnap.data()?.approvedOccasionIds);
    if (!approvedCategories.length || !approvedOccasionIds.length ||
      approvedCategories.some((code) => !activeCatering.includes(code))) {
      return deny("Provider occasion approvals require review.");
    }

    // Scan *every* occasion document, not just selected IDs. "Fits All" must
    // see the complete active applicable catalog, including page boundaries.
    const occasions: SetupGalleryOccasion[] = [];
    let cursor: string | null = null;
    let complete = false;
    let scanned = 0;
    for (let page = 0; page < policy.maxPages; page++) {
      let query = adminDb.collection("occasions")
        .orderBy(FieldPath.documentId()).limit(policy.pageSize);
      if (cursor !== null) query = query.startAfter(cursor);
      const snapshot = await tx.get(query);
      if (snapshot.empty) {
        complete = true;
        break;
      }
      for (const doc of snapshot.docs) {
        scanned++;
        if (scanned > policy.maxCatalogRecords ||
          (cursor !== null && doc.id <= cursor)) {
          return deny("Occasion catalog scan is incomplete.");
        }
        cursor = doc.id;
        const item = doc.data();
        if (item.moderationState !== "approved") continue;
        if (item.id !== doc.id || !OCCASION_ID.test(doc.id) ||
          typeof item.active !== "boolean" ||
          !Number.isSafeInteger(item.sortOrder) ||
          !Array.isArray(item.applicableServiceCategoryCodes) ||
          !item.applicableServiceCategoryCodes.length ||
          item.applicableServiceCategoryCodes.some((code: unknown) =>
            typeof code !== "string" || !OCCASION_ID.test(code)) ||
          (item.setupGalleryLegacyEventType !== undefined &&
          item.setupGalleryLegacyEventType !== null &&
          !["birthday", "wedding", "debut", "corporate", "anniversary",
            "other"].includes(item.setupGalleryLegacyEventType))) {
          return deny("Occasion catalog contains invalid approved records.");
        }
        positive(item.revision);
        occasions.push({id: doc.id, active: item.active,
          moderationState: "approved", sortOrder: item.sortOrder,
          applicableServiceCategoryCodes: item.applicableServiceCategoryCodes,
          setupGalleryLegacyEventType: item.setupGalleryLegacyEventType ?? null});
      }
    }
    if (!complete) return deny("Occasion catalog scan did not complete.");
    const authority: SetupGalleryAuthority = {
      catalog: occasions,
      catalogComplete: true,
      catalogRevision,
      providerEligibilityRevision: eligibilityRevision,
      approvedCateringCategoryCodes: approvedCategories,
      approvedOccasionIds,
      maxSpecificOccasions: policy.maxSpecificOccasions,
      maxCatalogRecords: policy.maxCatalogRecords,
      maxEffectiveMatches: policy.maxApplicableOccasions,
    };

    const canSave = PRIVATE_V2_WRITER_COVERAGE_VERIFIED &&
      MIXED_GALLERY_PUBLIC_V1_COMPATIBILITY_VERIFIED && policy.privateWrites &&
      provider.verificationStatus === "approved";
    const availability = {canSave, canPublishV2: false as const,
      reason: canSave ? null : "Private Setup Gallery V2 saving is disabled."};
    if (!input) return {galleryWriteSchemaVersion: 2 as const, revision,
      setups: previous, authority, availability};
    const incoming = input.setups as Record<string, unknown>[];
    const seen = new Set<string>();
    const setups: SavedSetup[] = incoming.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return deny("Invalid gallery setup.");
      }
      const id = entry.id;
      if (typeof id !== "string" || seen.has(id)) {
        return deny("Duplicate or invalid gallery identifier.");
      }
      seen.add(id);
      const earlier = previousById.get(id);
      if (entry.setupOccasionSchemaVersion !== 2) {
        if (earlier && earlier.setupOccasionSchemaVersion === 2) {
          return deny("V2 setup cannot be downgraded to V1.");
        }
        return parseProviderSetups([entry], account.uid)[0];
      }
      return resolveSetupGalleryV2(entry, account.uid, authority,
        earlier?.eventType ?? null) as ProviderSetupV2;
    });
    // The current public reader supports V1 only.
    // Never mark V2 as published before the V2 public projection is verified.
    const publishedV2 = setups.filter((setup) =>
      setup.setupOccasionSchemaVersion === 2 && setup.isPublished);
    if (publishedV2.length && (!PRIVATE_V2_PUBLICATION_VERIFIED || !policy.publicReads ||
      publishedV2.some((setup) => setup.eventType === null))) {
      return deny("V2 publication requires public reader approval and a legacy mapping.");
    }
    if (setups.some((setup) => setup.isPublished) &&
      !isPublicProviderRecord(providerId, provider, user)) {
      return deny("Only public approved providers can publish setups.");
    }
    for (const setup of setups) {
      for (const url of setup.imageUrls) {
        if (!currentPhotos.has(url) && !imageVerified.has(url)) {
          return deny("Gallery images changed. Reload before saving.");
        }
      }
    }
    // ALL reads, including category and complete catalog scans, precede write.
    tx.set(galleryRef, {
      providerId,
      setups,
      revision: revision + 1,
      galleryWriteSchemaVersion: 2,
      createdAt: current?.createdAt ?? FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {galleryWriteSchemaVersion: 2 as const, revision: revision + 1, setups, authority, availability};
  });
}
