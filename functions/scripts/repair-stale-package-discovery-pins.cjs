/**
 * Repair stale published V2 catering package discovery pins against the current
 * stable occasionCatalog/current revision.
 *
 * Uses the same transactional planner (planTransactionalV2DiscoveryRefresh) as
 * occasion lifecycle mutations. Never modifies status, isPublished, price, or
 * provider-authored occasionIds.
 *
 * Usage:
 *   node functions/scripts/repair-stale-package-discovery-pins.cjs           # dry-run (default)
 *   node functions/scripts/repair-stale-package-discovery-pins.cjs --apply   # apply updates
 */
const fs = require("node:fs");
const path = require("node:path");
const {initializeApp, applicationDefault, cert, getApps} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {
  planTransactionalV2DiscoveryRefresh,
} = require("../lib/packages/occasion-package-discovery-refresh.js");

function loadWebEnvFallback() {
  const envPath = path.resolve(__dirname, "../../apps/web/.env.local");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadWebEnvFallback();

const projectId =
  process.env.FIREBASE_ADMIN_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  "feasta-catering-system";
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim();
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

const app = getApps().length
  ? getApps()[0]
  : initializeApp({
      projectId,
      credential: clientEmail && privateKey
        ? cert({projectId, clientEmail, privateKey})
        : applicationDefault(),
    });

const db = getFirestore(app);
const apply = process.argv.includes("--apply");

async function main() {
  const summary = await db.runTransaction(async (tx) => {
    const catalog = (await tx.get(db.doc("occasionCatalog/current"))).data();
    if (!catalog || catalog.activationState !== "stable" ||
        !Number.isSafeInteger(catalog.revision) || catalog.revision < 1) {
      throw new Error("occasionCatalog/current is not stable.");
    }

    const plan = await planTransactionalV2DiscoveryRefresh(tx, db, {
      nextCatalogRevision: catalog.revision,
      onlyStale: true,
      skipUnavailablePackages: true,
    });

    const details = [];
    const now = new Date();
    for (const item of plan) {
      if (!item.changed) continue;
      const before = (await tx.get(db.collection("packages").doc(item.packageId))).data() || {};
      details.push({
        packageId: item.packageId,
        name: before.name ?? null,
        beforeRevision: before.occasionCatalogRevision ?? null,
        afterRevision: item.patch.occasionCatalogRevision,
        beforeEventType: before.eventType ?? null,
        afterEventType: item.patch.eventType,
        beforeMatchIds: before.occasionMatchIds ?? null,
        afterMatchIds: item.patch.occasionMatchIds,
      });
    }

    if (apply) {
      for (const item of plan) {
        if (!item.changed) continue;
        tx.update(db.collection("packages").doc(item.packageId), {
          ...item.patch,
          updatedAt: now,
        });
      }
    }

    return {
      mode: apply ? "apply" : "dry-run",
      projectId,
      catalogRevision: catalog.revision,
      refreshedCount: details.length,
      packages: details,
    };
  });

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("Repair failed:", error.message);
  process.exitCode = 1;
});
