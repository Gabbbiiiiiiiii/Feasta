"use strict";

/**
 * FEASTA Birthday historical dependency migration.
 *
 * PRIVATE OPERATOR MODULE.
 *
 * Importing or directly executing this file never reads or writes Firestore.
 * No deployment, callable endpoint, automatic migration, or release approval.
 *
 * Transactional creates require a separately authorized caller.
 */

const EXPECTED_PROJECT = "feasta-catering-system";
const EXPECTED_OCCASION = "birthday";
const EXPECTED_COUNT = 17;

const ID = /^[A-Za-z0-9_-]{1,128}$/u;

function loadContracts() {
  return {
    registry: require(
      "../lib/admin/occasion-dependency-registry.js"
    ),
    links: require(
      "../lib/admin/occasion-historical-booking-links.js"
    ),
  };
}

function validateProposal(report, registry) {
  if (!report ||
      report.project !== EXPECTED_PROJECT ||
      report.occasionId !== EXPECTED_OCCASION ||
      report.expectedCount !== EXPECTED_COUNT ||
      report.authorizedForWrite !== false ||
      report.snapshotIsolated !== false ||
      report.writersFenced !== false ||
      report.coverageVerified !== false ||
      report.canDeactivate !== false ||
      !Array.isArray(report.proposedWitnesses) ||
      report.proposedWitnesses.length !== EXPECTED_COUNT) {
    throw new Error("INVALID_MIGRATION_PROPOSAL");
  }

  const paths = new Set();
  const ids = new Set();

  for (const witness of report.proposedWitnesses) {
    if (!witness ||
        !registry.validOccasionDependencyEntry(witness.value) ||
        registry.occasionDependencyEntryPath(witness.value) !==
          witness.path ||
        witness.value.kind !== "submitted_booking" ||
        witness.value.occasionId !== EXPECTED_OCCASION ||
        !/^[a-f0-9]{40}$/u.test(witness.value.sourceId) ||
        paths.has(witness.path) ||
        ids.has(witness.value.sourceId)) {
      throw new Error("INVALID_MIGRATION_WITNESS");
    }

    paths.add(witness.path);
    ids.add(witness.value.sourceId);
  }

  return [...report.proposedWitnesses].sort(
    (a, b) => a.path.localeCompare(b.path)
  );
}

/**
 * This function stages a strictly create-only migration in an existing
 * Firestore transaction. It must NOT be called without a separately
 * authorized operator workflow.
 *
 * Caller must supply a real Admin Firestore transaction and default DB.
 * All source and target reads occur before the first create.
 */
async function stageWitnessCreatesInTransaction({
  transaction,
  db,
  report,
}) {
  if (!transaction ||
      typeof transaction.getAll !== "function" ||
      typeof transaction.get !== "function" ||
      typeof transaction.create !== "function" ||
      !db ||
      typeof db.doc !== "function" ||
      typeof db.collection !== "function") {
    throw new Error("INVALID_MIGRATION_CONTEXT");
  }

  const {registry, links} = loadContracts();
  const witnesses = validateProposal(report, registry);

  // Read the complete bounded main-event inventory inside this
  // transaction before staging any creates.
  const inventorySnapshot = await transaction.get(
    db.collection("mainEvents")
      .orderBy("__name__")
      .limit(41)
  );

  if (!inventorySnapshot ||
      !Array.isArray(inventorySnapshot.docs) ||
      inventorySnapshot.docs.length >= 41) {
    throw new Error("MIGRATION_INVENTORY_LIMIT_OR_INVALID");
  }

  const actualBirthdayIds = inventorySnapshot.docs
    .filter(doc => doc.data().eventType === EXPECTED_OCCASION)
    .map(doc => doc.id)
    .sort();

  const expectedBirthdayIds = witnesses
    .map(witness => witness.value.sourceId)
    .sort();

  if (actualBirthdayIds.length !== EXPECTED_COUNT ||
      actualBirthdayIds.some(
        (id, i) => id !== expectedBirthdayIds[i]
      )) {
    throw new Error("MIGRATION_INVENTORY_CHANGED");
  }

  const eventRefs = witnesses.map(witness =>
    db.doc(witness.value.sourcePath)
  );

  const eventSnapshots = await transaction.getAll(...eventRefs);

  if (eventSnapshots.length !== EXPECTED_COUNT) {
    throw new Error("INCOMPLETE_MIGRATION_SOURCE_READ");
  }

  const events = [];
  const requestIds = new Set();

  for (let i = 0; i < witnesses.length; i++) {
    const snapshot = eventSnapshots[i];
    const expected = witnesses[i].value;

    if (!snapshot.exists ||
        snapshot.ref.path !== expected.sourcePath) {
      throw new Error("MIGRATION_SOURCE_MISSING_OR_MISMATCHED");
    }

    const data = snapshot.data();

    if (registry.classifyMainEventForRegistry(
      expected.sourceId,
      data
    ) !== "submitted_booking" ||
        data.eventType !== EXPECTED_OCCASION) {
      throw new Error("MIGRATION_SOURCE_CLASSIFICATION_CHANGED");
    }

    events.push({
      id: expected.sourceId,
      data,
    });

    for (const id of data.providerRequestIds) {
      if (!ID.test(id)) {
        throw new Error("MIGRATION_REQUEST_ID_INVALID");
      }

      requestIds.add(id);
    }
  }

  const sortedRequestIds = [...requestIds].sort();

  if (sortedRequestIds.length > 40) {
    throw new Error("MIGRATION_REQUEST_LIMIT");
  }

  const requestRefs = sortedRequestIds.map(id =>
    db.doc(`providerRequests/${id}`)
  );

  const requestSnapshots = requestRefs.length ?
    await transaction.getAll(...requestRefs) : [];

  if (requestSnapshots.length !== sortedRequestIds.length) {
    throw new Error("INCOMPLETE_MIGRATION_REQUEST_READ");
  }

  const requests = requestSnapshots.map((snapshot, i) => {
    if (!snapshot.exists ||
        snapshot.ref.path !==
          `providerRequests/${sortedRequestIds[i]}`) {
      throw new Error("MIGRATION_REQUEST_MISSING");
    }

    return {
      id: sortedRequestIds[i],
      data: snapshot.data(),
    };
  });

  const relationshipReport = links.verifyHistoricalBookingLinks({
    mainEvents: events,
    providerRequests: requests,
  });

  if (relationshipReport.unresolvedBookingIds.length ||
      relationshipReport.orphanRequestIds.length ||
      relationshipReport.verifiedBookingIds.length !==
        EXPECTED_COUNT) {
    throw new Error("MIGRATION_BOOKING_LINKS_UNVERIFIED");
  }

  const witnessRefs = witnesses.map(witness =>
    db.doc(witness.path)
  );

  const witnessSnapshots = await transaction.getAll(
    ...witnessRefs
  );

  if (witnessSnapshots.length !== EXPECTED_COUNT ||
      witnessSnapshots.some(snapshot => snapshot.exists)) {
    throw new Error("MIGRATION_TARGET_NOT_EMPTY");
  }

  // No reads after this point. All 17 creates are atomic.
  for (let i = 0; i < witnesses.length; i++) {
    transaction.create(
      witnessRefs[i],
      witnesses[i].value
    );
  }

  return {
    proposedCreates: EXPECTED_COUNT,
    sourceBookingsVerified: events.length,
    linkedRequestsVerified: requests.length,
    snapshotIsolated: false,
    writersFenced: false,
    coverageVerified: false,
    canDeactivate: false,
  };
}

module.exports = {
  validateProposal,
  stageWitnessCreatesInTransaction,
};

// This file deliberately has no production execution entry point.
if (require.main === module) {
  process.stderr.write(
    "MIGRATION_NOT_EXECUTABLE: operator authorization required\n"
  );
  process.exitCode = 1;
}