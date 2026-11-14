/**
 * Routine, admin-only activation.
 *
 * This does not publish, withdraw or restore provider content.
 * It refuses transitions requiring existing content migration.
 */
import {createHash} from "node:crypto";
import {FieldPath} from "firebase-admin/firestore";
import type {Transaction} from "firebase-admin/firestore";
import {db} from "../shared/firestore.js";
import {isServiceCategoryCode} from "../shared/service-category-code.js";
import {scanOccasionPackageInventory} from "../packages/occasion-transition-inventory-scan.js";
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

    // Complete bounded inventory, not a partial sample.
    const packageSnap = await tx.get(db.collection("packages")
      .orderBy(FieldPath.documentId()).limit(41));
    if (packageSnap.size > 40) {
      refuse("PACKAGE_INVENTORY_TOO_LARGE");
    }

    const packageRows = packageSnap.docs.map((doc) => ({
      id: doc.id, data: doc.data(),
    }));

    const inventory = await scanOccasionPackageInventory({
      action: "activate",
      occasionId: input.occasionId,
      applicableCategoryCodes: codes as string[],
      readPage: async (after, limit) => packageRows
        .filter((row) => after === null || row.id > after)
        .slice(0, limit),
    });

    // Any package requiring occasion migration goes through
    // the existing release-sensitive workflow.
    if (inventory.candidatePackageIds.length > 0) {
      refuse("ROUTINE_ACTIVATION_PACKAGE_REVIEW_REQUIRED");
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
        data: doc.data(),
      })),
    });

    if (galleryChanges.length > 0) {
      refuse("ROUTINE_ACTIVATION_GALLERY_REVIEW_REQUIRED");
    }

    const now = new Date();
    const result = {
      operationId: id,
      occasionId: input.occasionId,
      action: "activate" as const,
      active: true,
      occasionRevision: occasion.revision + 1,
      catalogRevision: catalog.revision + 1,
      withdrawnPackageIds: [] as string[],
      withdrawnGallerySetupIds: [] as string[],
      state: "completed" as const,
      idempotentReplay: false,
    };

    // Only catalog and occasion authority change.
    tx.update(occasionRef, {
      active: true,
      revision: result.occasionRevision,
      updatedAt: now,
    });
    tx.update(catalogRef, {
      revision: result.catalogRevision,
      updatedAt: now,
    });

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
            data: doc.data(),
          }));

          const inventory = await scanOccasionPackageInventory({
            action: "activate",
            occasionId: input.occasionId,
            applicableCategoryCodes: codes as string[],
            readPage: async (after, limit) => rows
              .filter((row) => after === null || row.id > after)
              .slice(0, limit),
          });

          affectedPackages = inventory.candidatePackageIds.length;
          check("ROUTINE_ACTIVATION_PACKAGE_REVIEW_REQUIRED",
            affectedPackages === 0,
            "Existing packages must not need withdrawal or migration.");
        } catch {
          check("PACKAGE_INVENTORY_REQUIRES_REVIEW", false,
            "Package inventory could not be verified.");
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
              data: doc.data(),
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
      disclaimer: "Read-only preview. Activation repeats checks " +
        "inside its transaction and does not withdraw provider content.",
    };
  });
}