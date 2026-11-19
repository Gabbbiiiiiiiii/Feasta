/**
 * Routine, admin-only activation.
 *
 * Refreshes published V2 discovery pins to the new catalog revision.
 * Does not withdraw, republish, or restore provider publication flags.
 * Refuses transitions when discovery pins cannot be refreshed safely.
 */
import {createHash} from "node:crypto";
import {FieldPath} from "firebase-admin/firestore";
import type {Transaction} from "firebase-admin/firestore";
import type {GlobalOccasion} from "@feasta/shared-types/provider-package-v2";
import {db} from "../shared/firestore.js";
import {isServiceCategoryCode} from "../shared/service-category-code.js";
import {planPublishedPackageDiscoveryRefresh} from "../packages/occasion-package-discovery-refresh.js";
import {planOccasionGalleryWithdrawal} from "./occasion-lifecycle-atomic.js";
import {isRoutineOccasionTransitionValid} from "./occasion-routine-activation.js";
import {requireOccasionLifecycleAdmin} from "./occasion-activation-readiness.js";

type Input = {
  occasionId: string;
  expectedOccasionRevision: number;
  expectedCatalogRevision: number;
  idempotencyKey: string;
  reason: string;
};

function refuse(code: string): never {
  throw new Error(code);
}

function revision(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 && value < Number.MAX_SAFE_INTEGER - 1;
}

function operationId(uid: string, key: string): string {
  return createHash("sha256").update(JSON.stringify([
    uid, "occasion_routine_activation_v1", key,
  ])).digest("hex");
}

function fingerprint(uid: string, input: Input): string {
  return createHash("sha256").update(JSON.stringify([
    uid, input.occasionId, input.expectedOccasionRevision,
    input.expectedCatalogRevision, input.reason,
  ])).digest("hex");
}

function asGlobalOccasion(
  id: string, data: Record<string, unknown>, forceActive?: boolean,
): GlobalOccasion {
  if (data.id !== id || data.moderationState !== "approved" ||
      !Array.isArray(data.applicableServiceCategoryCodes) ||
      !revision(data.revision) ||
      typeof data.sortOrder !== "number" ||
      !Number.isSafeInteger(data.sortOrder)) {
    refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
  }
  return {
    id,
    label: typeof data.label === "string" ? data.label : id,
    normalizedName: typeof data.normalizedName === "string" ?
      data.normalizedName : id,
    aliases: Array.isArray(data.aliases) ? data.aliases as string[] : [],
    active: forceActive === true ? true : data.active === true,
    moderationState: "approved",
    applicableServiceCategoryCodes:
      data.applicableServiceCategoryCodes as string[],
    sortOrder: data.sortOrder,
    revision: data.revision,
    createdBy: typeof data.createdBy === "string" ? data.createdBy : "system",
    createdAt: data.createdAt as GlobalOccasion["createdAt"],
    updatedAt: data.updatedAt as GlobalOccasion["updatedAt"],
  };
}

async function loadRefreshAuthority(
  tx: Transaction,
  input: {
    activatingOccasionId: string;
    activatingOccasion: Record<string, unknown>;
    catalogRevision: number;
    categoryCodes: readonly string[];
  },
) {
  const policy = (await tx.get(
    db.doc("contractPolicies/providerPackageV2")
  )).data();
  if (!policy ||
      !Number.isSafeInteger(policy.maxSpecificOccasions) ||
      policy.maxSpecificOccasions < 1 ||
      policy.maxSpecificOccasions > 100) {
    refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
  }

  const occasionSnap = await tx.get(
    db.collection("occasions").where("active", "==", true).limit(1001)
  );
  if (occasionSnap.size > 1000) {
    refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
  }

  const byId = new Map<string, GlobalOccasion>();
  for (const doc of occasionSnap.docs) {
    byId.set(doc.id, asGlobalOccasion(doc.id, doc.data() as Record<string, unknown>));
  }
  byId.set(input.activatingOccasionId, asGlobalOccasion(
    input.activatingOccasionId,
    input.activatingOccasion,
    true,
  ));

  return {
    catalog: [...byId.values()],
    catalogRevision: input.catalogRevision,
    maxSpecificOccasions: policy.maxSpecificOccasions as number,
    approvedActiveCategoryCodes: [...input.categoryCodes],
  };
}

export async function activateRoutineOccasion(
  actorUid: string, input: Input,
) {
  const id = operationId(actorUid, input.idempotencyKey);
  const hash = fingerprint(actorUid, input);

  const catalogRef = db.doc("occasionCatalog/current");
  const occasionRef = db.collection("occasions").doc(input.occasionId);
  const opRef = db.collection("occasionRoutineActivationOperations").doc(id);
  const auditRef = db.collection("occasionRoutineActivationAudits").doc(id);

  return db.runTransaction(async (tx: Transaction) => {
    await requireOccasionLifecycleAdmin(tx, actorUid);

    const [opSnap, auditSnap] = await Promise.all([
      tx.get(opRef), tx.get(auditRef),
    ]);
    const previous = opSnap.data();
    const previousAudit = auditSnap.data();

    if (!!previous !== !!previousAudit) {
      refuse("ROUTINE_ACTIVATION_AUDIT_MISSING");
    }

    if (previous) {
      if (previous.hash !== hash ||
          previousAudit?.hash !== hash ||
          previous.actorUid !== actorUid ||
          previous.action !== "activate" ||
          previous.state !== "completed" ||
          previousAudit?.action !== "occasion_activate" ||
          previousAudit?.occasionId !== input.occasionId ||
          previous.result?.operationId !== id ||
          previous.result?.occasionId !== input.occasionId ||
          previous.result?.state !== "completed") {
        refuse("IDEMPOTENCY_CONFLICT");
      }
      return {...previous.result, idempotentReplay: true};
    }

    const [catalogSnap, occasionSnap] = await Promise.all([
      tx.get(catalogRef), tx.get(occasionRef),
    ]);
    const catalog = catalogSnap.data();
    const occasion = occasionSnap.data();

    if (catalog?.activationState !== "stable" ||
        !revision(catalog.revision) ||
        catalog.revision !== input.expectedCatalogRevision ||
        !occasion ||
        occasion.id !== input.occasionId ||
        !isRoutineOccasionTransitionValid({
          id: occasion.id,
          moderationState: occasion.moderationState,
          active: occasion.active,
          revision: occasion.revision,
        }, "activate", input.expectedOccasionRevision) ||
        !revision(occasion.revision)) {
      refuse("OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT");
    }

    const codes: unknown = occasion.applicableServiceCategoryCodes;
    if (!Array.isArray(codes) ||
        codes.length < 1 || codes.length > 100 ||
        !codes.every(isServiceCategoryCode) ||
        new Set(codes).size !== codes.length) {
      refuse("OCCASION_LIFECYCLE_CATEGORY_INVALID");
    }

    for (const code of codes as string[]) {
      const category = (await tx.get(
        db.collection("serviceCategories").doc(code)
      )).data();

      if (category?.code !== code ||
          category.status !== "active" ||
          !["catering", "addon"].includes(category.serviceType)) {
        refuse("OCCASION_LIFECYCLE_CATEGORY_INACTIVE");
      }
    }

    const packageSnap = await tx.get(db.collection("packages")
      .orderBy(FieldPath.documentId()).limit(41));
    if (packageSnap.size > 40) {
      refuse("PACKAGE_INVENTORY_TOO_LARGE");
    }

    const packageRows = packageSnap.docs.map((doc) => ({
      id: doc.id, data: doc.data() as Record<string, unknown>,
    }));

    const nextCatalogRevision = catalog.revision + 1;
    const authority = await loadRefreshAuthority(tx, {
      activatingOccasionId: input.occasionId,
      activatingOccasion: occasion as Record<string, unknown>,
      catalogRevision: nextCatalogRevision,
      categoryCodes: codes as string[],
    });

    let refreshPlan;
    try {
      refreshPlan = planPublishedPackageDiscoveryRefresh({
        packageRows,
        catalog: authority.catalog,
        catalogRevision: authority.catalogRevision,
        maxSpecificOccasions: authority.maxSpecificOccasions,
        approvedActiveCategoryCodes: authority.approvedActiveCategoryCodes,
      });
    } catch {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }

    const gallerySnap = await tx.get(
      db.collectionGroup("catalog").limit(41)
    );
    if (gallerySnap.size > 40) {
      refuse("GALLERY_INVENTORY_TOO_LARGE");
    }

    const galleryChanges = planOccasionGalleryWithdrawal({
      action: "activate",
      occasionId: input.occasionId,
      docs: gallerySnap.docs.map((doc) => ({
        ref: doc.ref,
        data: doc.data() as Record<string, unknown>,
      })),
    });

    if (galleryChanges.length > 0) {
      refuse("ROUTINE_ACTIVATION_GALLERY_REVIEW_REQUIRED");
    }

    const now = new Date();
    const refreshedPackageIds = refreshPlan
      .filter((item) => item.changed)
      .map((item) => item.packageId);
    const result = {
      operationId: id,
      occasionId: input.occasionId,
      action: "activate" as const,
      active: true,
      occasionRevision: occasion.revision + 1,
      catalogRevision: nextCatalogRevision,
      withdrawnPackageIds: [] as string[],
      withdrawnGallerySetupIds: [] as string[],
      refreshedPackageIds,
      state: "completed" as const,
      idempotentReplay: false,
    };

    tx.update(occasionRef, {
      active: true,
      revision: result.occasionRevision,
      updatedAt: now,
    });
    tx.update(catalogRef, {
      revision: result.catalogRevision,
      updatedAt: now,
    });

    for (const item of refreshPlan) {
      if (!item.changed) continue;
      tx.update(db.collection("packages").doc(item.packageId), {
        ...item.patch,
        updatedAt: now,
      });
    }

    tx.create(opRef, {
      operationId: id,
      actorUid,
      hash,
      action: "activate",
      state: "completed",
      result,
      createdAt: now,
    });
    tx.create(auditRef, {
      operationId: id,
      actorUid,
      hash,
      action: "occasion_activate",
      occasionId: input.occasionId,
      reason: input.reason,
      beforeActive: false,
      afterActive: true,
      beforeOccasionRevision: occasion.revision,
      afterOccasionRevision: result.occasionRevision,
      beforeCatalogRevision: catalog.revision,
      afterCatalogRevision: result.catalogRevision,
      refreshedPackageIds,
      createdAt: now,
    });

    return result;
  });
}

/**
 * Read-only routine activation preview.
 * The mutation independently repeats these checks transactionally.
 */
export async function inspectRoutineOccasionActivation(
  actorUid: string,
  input: {
    occasionId: string;
    expectedOccasionRevision: number;
    expectedCatalogRevision: number;
  },
) {
  return db.runTransaction(async (tx: Transaction) => {
    await requireOccasionLifecycleAdmin(tx, actorUid);

    const catalog = (await tx.get(
      db.doc("occasionCatalog/current")
    )).data();

    const occasion = (await tx.get(
      db.collection("occasions").doc(input.occasionId)
    )).data();

    const checks: Array<{
      code: string;
      status: "SATISFIED" | "BLOCKED";
      message: string;
    }> = [];

    const check = (code: string, valid: boolean, message: string) => {
      checks.push({
        code,
        status: valid ? "SATISFIED" : "BLOCKED",
        message,
      });
    };

    check("ADMIN_APP_CHECK", true,
      "Administrator authorization and App Check passed.");

    check("APPROVED_OCCASION",
      occasion?.id === input.occasionId &&
        occasion?.moderationState === "approved",
      "The event type must be approved.");

    check("OCCASION_STATE", occasion?.active === false,
      "The event type must currently be inactive.");

    check("STABLE_CATALOG",
      catalog?.activationState === "stable" &&
        revision(catalog?.revision),
      "The event catalog must be stable.");

    check("CATALOG_REVISION",
      revision(catalog?.revision) &&
        catalog.revision === input.expectedCatalogRevision,
      "The catalog revision must be current.");

    check("OCCASION_REVISION",
      revision(occasion?.revision) &&
        occasion.revision === input.expectedOccasionRevision,
      "The event type revision must be current.");

    const codes: unknown = occasion?.applicableServiceCategoryCodes;
    let mappingsValid = Array.isArray(codes) &&
      codes.length > 0 && codes.length <= 100 &&
      codes.every(isServiceCategoryCode) &&
      new Set(codes).size === codes.length;

    if (mappingsValid) {
      for (const code of codes as string[]) {
        const category = (await tx.get(
          db.collection("serviceCategories").doc(code)
        )).data();

        if (category?.code !== code ||
            category.status !== "active" ||
            !["catering", "addon"].includes(category.serviceType)) {
          mappingsValid = false;
        }
      }
    }

    check("ACTIVE_CATEGORY_MAPPINGS", mappingsValid,
      "Every applicable service category must be active.");

    let packageCount: number | null = null;
    let galleryCount: number | null = null;
    let affectedPackages: number | null = null;
    let affectedGallerySetups: number | null = null;

    if (checks.every((row) => row.status === "SATISFIED")) {
      const packages = await tx.get(db.collection("packages")
        .orderBy(FieldPath.documentId()).limit(41));

      packageCount = packages.docs.length;

      if (packageCount > 40) {
        check("PACKAGE_INVENTORY_TOO_LARGE", false,
          "Package inventory exceeds the verified limit.");
      } else {
        try {
          const rows = packages.docs.map((doc) => ({
            id: doc.id,
            data: doc.data() as Record<string, unknown>,
          }));
          if (!catalog || !revision(catalog.revision) || !occasion) {
            throw new Error("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
          }
          const authority = await loadRefreshAuthority(tx, {
            activatingOccasionId: input.occasionId,
            activatingOccasion: occasion as Record<string, unknown>,
            catalogRevision: catalog.revision + 1,
            categoryCodes: codes as string[],
          });
          const refreshPlan = planPublishedPackageDiscoveryRefresh({
            packageRows: rows,
            catalog: authority.catalog,
            catalogRevision: authority.catalogRevision,
            maxSpecificOccasions: authority.maxSpecificOccasions,
            approvedActiveCategoryCodes: authority.approvedActiveCategoryCodes,
          });
          affectedPackages = refreshPlan.filter((item) => item.changed).length;
          check("PACKAGE_DISCOVERY_REFRESH_REQUIRED", true,
            "Published packages can be refreshed to the new catalog revision.");
        } catch {
          check("PACKAGE_DISCOVERY_REFRESH_REQUIRED", false,
            "Published packages could not be refreshed for this activation.");
        }
      }

      const galleries = await tx.get(
        db.collectionGroup("catalog").limit(41)
      );
      galleryCount = galleries.docs.length;

      if (galleryCount > 40) {
        check("GALLERY_INVENTORY_TOO_LARGE", false,
          "Gallery inventory exceeds the verified limit.");
      } else {
        try {
          const changes = planOccasionGalleryWithdrawal({
            action: "activate",
            occasionId: input.occasionId,
            docs: galleries.docs.map((doc) => ({
              ref: doc.ref,
              data: doc.data() as Record<string, unknown>,
            })),
          });

          affectedGallerySetups = changes.reduce(
            (sum, item) => sum + item.withdrawnIds.length, 0
          );

          check("ROUTINE_ACTIVATION_GALLERY_REVIEW_REQUIRED",
            changes.length === 0,
            "Existing gallery setups must not need withdrawal.");
        } catch {
          check("GALLERY_INVENTORY_REQUIRES_REVIEW", false,
            "Gallery inventory could not be verified.");
        }
      }
    }

    const blockers = checks
      .filter((row) => row.status === "BLOCKED")
      .map((row) => row.code);

    return {
      occasionId: input.occasionId,
      action: "activate" as const,
      status: blockers.length ?
        "BLOCKED" as const : "ELIGIBLE_FOR_TRANSACTION" as const,
      lifecycleAvailable: blockers.length === 0,
      occasionRevision: revision(occasion?.revision) ?
        occasion.revision as number : null,
      catalogRevision: revision(catalog?.revision) ?
        catalog.revision as number : null,
      checks,
      blockers,
      packageCount,
      galleryCount,
      affectedPackages,
      affectedGallerySetups,
      disclaimer: "Read-only preview. Activation refreshes published " +
        "package discovery pins and does not withdraw provider content.",
    };
  });
}

/** Bounded repair of already-stale published V2 discovery pins. */
export async function repairPublishedPackageDiscovery(actorUid: string) {
  return db.runTransaction(async (tx: Transaction) => {
    await requireOccasionLifecycleAdmin(tx, actorUid);

    const catalog = (await tx.get(
      db.doc("occasionCatalog/current")
    )).data();
    if (catalog?.activationState !== "stable" || !revision(catalog.revision)) {
      refuse("OCCASION_LIFECYCLE_REVISION_OR_STATE_CONFLICT");
    }

    const policy = (await tx.get(
      db.doc("contractPolicies/providerPackageV2")
    )).data();
    if (!policy ||
        !Number.isSafeInteger(policy.maxSpecificOccasions) ||
        policy.maxSpecificOccasions < 1 ||
        policy.maxSpecificOccasions > 100) {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }

    const categoriesSnap = await tx.get(
      db.collection("serviceCategories").where("status", "==", "active").limit(101)
    );
    if (categoriesSnap.size > 100) {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }
    const activeCategories = categoriesSnap.docs
      .map((doc) => {
        const row = doc.data();
        if (!row || row.code !== doc.id ||
            !isServiceCategoryCode(row.code) ||
            !["catering", "addon"].includes(row.serviceType)) {
          return null;
        }
        return row.code as string;
      })
      .filter((code): code is string => code !== null);

    if (activeCategories.length < 1) {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }

    const occasionSnap = await tx.get(
      db.collection("occasions").where("active", "==", true).limit(1001)
    );
    if (occasionSnap.size > 1000) {
      refuse("PACKAGE_DISCOVERY_REFRESH_REQUIRED");
    }
    const catalogRows = occasionSnap.docs.map((doc) =>
      asGlobalOccasion(doc.id, doc.data() as Record<string, unknown>));

    const packageSnap = await tx.get(db.collection("packages")
      .orderBy(FieldPath.documentId()).limit(41));
    if (packageSnap.size > 40) {
      refuse("PACKAGE_INVENTORY_TOO_LARGE");
    }

    const packageRows = packageSnap.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as Record<string, unknown>,
    }));

    const refreshPlan = planPublishedPackageDiscoveryRefresh({
      packageRows,
      catalog: catalogRows,
      catalogRevision: catalog.revision,
      maxSpecificOccasions: policy.maxSpecificOccasions as number,
      approvedActiveCategoryCodes: activeCategories,
      onlyStale: true,
    });

    const now = new Date();
    const refreshedPackageIds: string[] = [];
    for (const item of refreshPlan) {
      tx.update(db.collection("packages").doc(item.packageId), {
        ...item.patch,
        updatedAt: now,
      });
      refreshedPackageIds.push(item.packageId);
    }

    const skippedPackageIds = packageRows
      .filter((row) => row.data.occasionSchemaVersion === 2 &&
        exposedPackage(row.data) &&
        !refreshedPackageIds.includes(row.id))
      .map((row) => row.id)
      .sort();

    return {
      catalogRevision: catalog.revision as number,
      refreshedPackageIds: refreshedPackageIds.sort(),
      skippedPackageIds,
    };
  });
}

function exposedPackage(data: Readonly<Record<string, unknown>>): boolean {
  return data.isPublished !== false || data.isActive !== false ||
    data.providerPubliclyVisible !== false || data.status === "published";
}
