/**
 * One-shot repair: for outstanding company advances, move still-pending
 * provider earnings into available. Uses production Admin SDK credentials
 * from the local Firebase CLI / ADC environment.
 */
const {initializeApp, applicationDefault} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

const domain = require("../lib/provider-finance/company-float-domain.js");
const {
  releaseProviderSettlementAvailability,
  settlementIdForEarning,
} = require("../lib/provider-finance/provider-settlement-domain.js");

initializeApp({
  credential: applicationDefault(),
  projectId: "feasta-catering-system",
});

const db = getFirestore();

async function repairAdvance(advanceSnap) {
  const advance = advanceSnap.data() ?? {};
  const providerRequestId = String(advance.providerRequestId ?? "");
  const providerId = String(advance.providerId ?? "");
  if (!providerRequestId || !providerId) {
    return {advanceId: advanceSnap.id, released: 0, reason: "missing_ids"};
  }

  const bookingSnap = await db
    .collection("providerRequests")
    .doc(providerRequestId)
    .get();
  if (!bookingSnap.exists) {
    return {advanceId: advanceSnap.id, released: 0, reason: "booking_missing"};
  }
  const booking = bookingSnap.data() ?? {};
  const paymentIds = domain.bookingPaymentIdsForEarnings(booking);

  let earningDocs = [];
  if (paymentIds.length > 0) {
    const snaps = await db.getAll(
      ...paymentIds.map((id) => db.collection("providerEarnings").doc(id)),
    );
    earningDocs = snaps.filter(
      (snap) =>
        snap.exists &&
        snap.data()?.providerRequestId === providerRequestId &&
        snap.data()?.providerId === providerId,
    );
  }
  if (earningDocs.length === 0) {
    const queried = await db
      .collection("providerEarnings")
      .where("providerRequestId", "==", providerRequestId)
      .get();
    earningDocs = queried.docs.filter(
      (doc) => doc.data()?.providerId === providerId,
    );
  }

  let released = 0;
  await db.runTransaction(async (transaction) => {
    const earnings = [];
    for (const doc of earningDocs) {
      const snap = await transaction.get(doc.ref);
      if (!snap.exists) continue;
      earnings.push({ref: snap.ref, data: snap.data() ?? {}});
    }
    const settlementSnaps = await Promise.all(
      earnings.map((earning) =>
        transaction.get(
          db
            .collection("providerSettlements")
            .doc(settlementIdForEarning(earning.ref.id)),
        ),
      ),
    );

    const timestamp = FieldValue.serverTimestamp();
    for (let index = 0; index < earnings.length; index += 1) {
      const earning = earnings[index];
      const settlementSnap = settlementSnaps[index];
      const settlement = settlementSnap.exists
        ? settlementSnap.data() ?? {}
        : null;

      if (settlement && settlement.status === "awaiting_availability") {
        try {
          const release = releaseProviderSettlementAvailability({
            settlement,
            earning: earning.data,
            timestamp,
          });
          transaction.update(earning.ref, {
            ...release.earningUpdate,
            companyAdvanceId: advance.advanceId ?? advanceSnap.id,
            companyAdvanceAvailabilityReleasedAt: timestamp,
            updatedAt: timestamp,
          });
          transaction.update(settlementSnap.ref, {
            ...release.settlementUpdate,
            updatedAt: timestamp,
          });
          released += Number(earning.data.pendingAmountInCentavos ?? 0);
          continue;
        } catch {
          // fall through
        }
      }

      const planned = domain.planProviderEarningAdvanceAvailability(earning.data);
      if (!planned) continue;
      transaction.update(earning.ref, {
        status: planned.status,
        pendingAmountInCentavos: planned.pendingAmountInCentavos,
        availableAmountInCentavos: planned.availableAmountInCentavos,
        availableAt: timestamp,
        companyAdvanceId: advance.advanceId ?? advanceSnap.id,
        companyAdvanceAvailabilityReleasedAt: timestamp,
        updatedAt: timestamp,
      });
      released += planned.releasedAmountInCentavos;
    }

    if (released > 0) {
      transaction.update(bookingSnap.ref, {
        companyAdvanceEarningsReleasedInCentavos: released,
        updatedAt: timestamp,
      });
    }
  });

  return {advanceId: advanceSnap.id, released, reason: "ok"};
}

async function main() {
  const snap = await db
    .collection("companyProviderAdvances")
    .where("status", "==", "outstanding")
    .get();

  const results = [];
  for (const doc of snap.docs) {
    results.push(await repairAdvance(doc));
  }
  console.log(JSON.stringify({count: results.length, results}, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
