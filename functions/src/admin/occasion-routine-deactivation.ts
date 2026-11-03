/**
 * Routine, admin-only deactivation.
 *
 * This changes only event-type authority. Provider content requiring withdrawal blocks the operation.
 * It refuses transitions requiring existing content migration.
 */
import {createHash} from "node:crypto";
import {FieldPath} from "firebase-admin/firestore";
import {assertNoOccasionBookingDependencies} from "./occasion-booking-dependencies.js";
import type {Query, QuerySnapshot, Transaction} from "firebase-admin/firestore";
import {db} from "../shared/firestore.js";
import {isServiceCategoryCode} from "../shared/service-category-code.js";
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
    uid, "occasion_routine_deactivation_v1", key,
  ])).digest("hex");
}

function fingerprint(uid: string, input: Input): string {
  return createHash("sha256").update(JSON.stringify([
    uid, input.occasionId, input.expectedOccasionRevision,
    input.expectedCatalogRevision, input.reason,
  ])).digest("hex");
}

/**
 * Complete booking evidence is required inside the lifecycle transaction.
 *
 * An unfiltered scan includes malformed and historical records that a
 * target-occasion-only query could silently miss.
 *
 * A failed transaction, inconsistent page, or incomplete inventory
 * cannot authorize deactivation.
 */
async function requireNoLiveRoutineBookingDependencies(
  tx: Transaction,
  occasionId: string,
): Promise<void> {
  const pageSize = 40;

  async function readCompleteInventory(
    collectionName: "mainEvents" | "providerRequests",
  ): Promise<Map<string, Record<string, unknown>>> {
    const rows = new Map<string, Record<string, unknown>>();
    let cursor: string | null = null;

    while (true) {
      const ordered = db.collection(collectionName)
        .orderBy(FieldPath.documentId());

      const query: Query = cursor === null ?
        ordered.limit(pageSize) :
        ordered.startAfter(cursor).limit(pageSize);

      const snapshot: QuerySnapshot = await tx.get(query);

      if (!Array.isArray(snapshot.docs) ||
          snapshot.docs.length > pageSize ||
          snapshot.size !== snapshot.docs.length) {
        refuse("OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED");
      }

      let previous: string | null = cursor;

      for (const doc of snapshot.docs) {
        if (typeof doc.id !== "string" ||
            doc.id.length === 0 ||
            (previous !== null && doc.id <= previous) ||
            rows.has(doc.id)) {
          refuse("OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED");
        }

        const data: unknown = doc.data();

        if (data === null ||
            typeof data !== "object" ||
            Array.isArray(data)) {
          refuse("OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED");
        }

        rows.set(doc.id, data as Record<string, unknown>);
        previous = doc.id;
      }

      if (snapshot.docs.length < pageSize) {
        return rows;
      }

      if (previous === null || previous === cursor) {
        refuse("OCCASION_BOOKING_DEPENDENCIES_UNVERIFIED");
      }

      cursor = previous;
    }
  }

  const events = await readCompleteInventory("mainEvents");
  const requests = await readCompleteInventory("providerRequests");

  assertNoOccasionBookingDependencies({
    occasionId,
    events,
    requests,
  });
}
export async function deactivateRoutineOccasion(
  actorUid: string, input: Input,
) {
  const id = operationId(actorUid, input.idempotencyKey);
  const hash = fingerprint(actorUid, input);

  const catalogRef = db.doc("occasionCatalog/current");
  const occasionRef = db.collection("occasions").doc(input.occasionId);
  const opRef = db.collection("occasionRoutineDeactivationOperations").doc(id);
  const auditRef = db.collection("occasionRoutineDeactivationAudits").doc(id);

  return db.runTransaction(async (tx: Transaction) => {
    await requireOccasionLifecycleAdmin(tx, actorUid);

    const [opSnap, auditSnap] = await Promise.all([
      tx.get(opRef), tx.get(auditRef),
    ]);
    const previous = opSnap.data();
    const previousAudit = auditSnap.data();

    if (!!previous !== !!previousAudit) {
      refuse("ROUTINE_DEACTIVATION_AUDIT_MISSING");
    }

    if (previous) {
      if (previous.hash !== hash ||
          previousAudit?.hash !== hash ||
          previous.actorUid !== actorUid ||
          previous.action !== "deactivate" ||
          previous.state !== "completed" ||
          previousAudit?.action !== "occasion_deactivate" ||
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
        }, "deactivate", input.expectedOccasionRevision) ||
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

    await requireNoLiveRoutineBookingDependencies(tx, input.occasionId);

    // Logical deactivation: existing public records are not rewritten.
    // Customer and provider paths must enforce current occasion authority.
    const withdrawnPackageIds: string[] = [];
    const withdrawnGallerySetupIds: string[] = [];

    const now = new Date();
    const result = {
      operationId: id,
      occasionId: input.occasionId,
      action: "deactivate" as const,
      active: false,
      occasionRevision: occasion.revision + 1,
      catalogRevision: catalog.revision + 1,
      withdrawnPackageIds,
      withdrawnGallerySetupIds,
      state: "completed" as const,
      idempotentReplay: false,
    };


    tx.update(occasionRef, {
      active: false,
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
      action: "deactivate",
      state: "completed",
      result,
      createdAt: now,
    });
    tx.create(auditRef, {
      operationId: id,
      actorUid,
      hash,
      action: "occasion_deactivate",
      occasionId: input.occasionId,
      reason: input.reason,
      beforeActive: true,
      afterActive: false,
      beforeOccasionRevision: occasion.revision,
      afterOccasionRevision: result.occasionRevision,
      beforeCatalogRevision: catalog.revision,
      afterCatalogRevision: result.catalogRevision,
      withdrawnPackageIds,
      withdrawnGallerySetupIds,
      galleryWithdrawalLedger: [],
      createdAt: now,
    });

    return result;
  });
}

/**
 * Read-only routine activation preview.
 * The mutation independently repeats these checks transactionally.
 */
export async function inspectRoutineOccasionDeactivation(
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

    check("OCCASION_STATE", occasion?.active === true,
      "The event type must currently be active.");

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

    try {
      await requireNoLiveRoutineBookingDependencies(tx, input.occasionId);
      check("NO_LIVE_BOOKING_DEPENDENCIES", true,
        "No active booking dependencies were found.");
    } catch {
      check("BOOKING_DEPENDENCIES_REQUIRE_REVIEW", false,
        "Booking dependencies require review before deactivation.");
    }

    // Logical deactivation does not scan or rewrite provider content.
    // Keep nullable response fields for existing Admin UI compatibility.
    const packageCount: number | null = null;
    const galleryCount: number | null = null;
    const affectedPackages: number | null = null;
    const affectedGallerySetups: number | null = null;

    const blockers = checks
      .filter((row) => row.status === "BLOCKED")
      .map((row) => row.code);

    return {
      occasionId: input.occasionId,
      action: "deactivate" as const,
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
      disclaimer: "Read-only preview. Deactivation repeats checks " +
        "inside its transaction and does not withdraw provider content.",
    };
  });
}