/**
 * One-shot repair: outstanding company advances on fully_settled bookings
 * become repaid with zero outstanding debt (and float outstanding is reduced).
 */
const {initializeApp, applicationDefault} = require("firebase-admin/app");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");

initializeApp({
  credential: applicationDefault(),
  projectId: "feasta-catering-system",
});

const db = getFirestore();

async function repairAdvance(advanceSnap) {
  const advance = advanceSnap.data() ?? {};
  const providerRequestId = String(advance.providerRequestId ?? "");
  if (!providerRequestId) {
    return {advanceId: advanceSnap.id, changed: false, reason: "missing_request"};
  }

  const bookingSnap = await db
    .collection("providerRequests")
    .doc(providerRequestId)
    .get();
  if (!bookingSnap.exists) {
    return {advanceId: advanceSnap.id, changed: false, reason: "booking_missing"};
  }

  const booking = bookingSnap.data() ?? {};
  if (booking.settlementStatus !== "fully_settled") {
    return {
      advanceId: advanceSnap.id,
      changed: false,
      reason: "not_fully_settled",
      settlementStatus: booking.settlementStatus ?? null,
    };
  }

  const amount = Number(
    advance.outstandingAmountInCentavos ?? advance.amountInCentavos ?? 0,
  );
  if (!Number.isSafeInteger(amount) || amount < 0) {
    return {advanceId: advanceSnap.id, changed: false, reason: "invalid_amount"};
  }

  const floatRef = db.collection("companyFinance").doc("float");

  await db.runTransaction(async (transaction) => {
    const [freshAdvanceSnap, floatSnap] = await Promise.all([
      transaction.get(advanceSnap.ref),
      transaction.get(floatRef),
    ]);
    if (!freshAdvanceSnap.exists) {
      return;
    }
    const fresh = freshAdvanceSnap.data() ?? {};
    if (fresh.status !== "outstanding") {
      return;
    }

    const outstanding = Number(
      fresh.outstandingAmountInCentavos ?? fresh.amountInCentavos ?? 0,
    );
    const alreadyRepaid = Number(fresh.repaidAmountInCentavos ?? 0);
    const float = floatSnap.exists ? floatSnap.data() ?? {} : {};
    const floatOutstanding = Number(float.outstandingAdvanceInCentavos ?? 0);
    const timestamp = FieldValue.serverTimestamp();

    transaction.update(advanceSnap.ref, {
      status: "repaid",
      outstandingAmountInCentavos: 0,
      repaidAmountInCentavos: alreadyRepaid + outstanding,
      repaidAt: timestamp,
      updatedAt: timestamp,
      fullPaymentNoDebt: true,
    });
    transaction.update(bookingSnap.ref, {
      companyAdvanceStatus: "repaid",
      companyAdvanceOutstandingInCentavos: 0,
      updatedAt: timestamp,
    });
    if (floatSnap.exists && outstanding > 0) {
      const nextOutstanding = Math.max(0, floatOutstanding - outstanding);
      transaction.update(floatRef, {
        outstandingAdvanceInCentavos: nextOutstanding,
        updatedAt: timestamp,
      });
    }
  });

  return {
    advanceId: advanceSnap.id,
    changed: true,
    reason: "ok",
    clearedOutstandingInCentavos: amount,
  };
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
