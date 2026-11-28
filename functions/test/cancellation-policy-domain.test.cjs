const test = require("node:test");
const assert = require("node:assert/strict");
const {Timestamp} = require("firebase-admin/firestore");

const {
  CANCELLATION_POLICY_SCHEMA_VERSION,
  DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS,
  DEFAULT_ADMIN_CANCELLATION_MAX_HOURS,
  DEFAULT_ADMIN_CANCELLATION_MIN_HOURS,
  buildCancellationPolicySnapshot,
  parseAdminCancellationPolicyDraft,
  parseProviderCancellationPolicyDraft,
  parseStoredAdminCancellationPolicy,
  parseStoredCancellationPolicySnapshot,
  parseStoredProviderCancellationPolicy,
  resolveEffectiveCancellationPolicy,
  seededAdminCancellationPolicy,
} = require("../lib/cancellations/cancellation-policy-domain.js");

const {
  assertNewCancellationBeforeEnd,
  cancellationDeadline,
} = require("../lib/cancellations/cancellation-deadline.js");

test("seededAdminCancellationPolicy provides 3d default, 1d min, 30d max", () => {
  const seeded = seededAdminCancellationPolicy();
  assert.equal(seeded.schemaVersion, CANCELLATION_POLICY_SCHEMA_VERSION);
  assert.equal(seeded.defaultCutoffHoursBeforeEvent, DEFAULT_ADMIN_CANCELLATION_CUTOFF_HOURS);
  assert.equal(seeded.minCutoffHoursBeforeEvent, DEFAULT_ADMIN_CANCELLATION_MIN_HOURS);
  assert.equal(seeded.maxCutoffHoursBeforeEvent, DEFAULT_ADMIN_CANCELLATION_MAX_HOURS);
  assert.deepEqual(parseStoredAdminCancellationPolicy(null), seeded);
});

test("parseAdminCancellationPolicyDraft validates bounds and rejects invalid values", () => {
  const valid = parseAdminCancellationPolicyDraft({
    defaultCutoffHoursBeforeEvent: 36,
    minCutoffHoursBeforeEvent: 12,
    maxCutoffHoursBeforeEvent: 168,
    guidanceNote: "  Cancel at least 36 hours ahead.  ",
  });
  assert.equal(valid.defaultCutoffHoursBeforeEvent, 36);
  assert.equal(valid.minCutoffHoursBeforeEvent, 12);
  assert.equal(valid.maxCutoffHoursBeforeEvent, 168);
  assert.equal(valid.guidanceNote, "Cancel at least 36 hours ahead.");

  assert.throws(() => parseAdminCancellationPolicyDraft({
    defaultCutoffHoursBeforeEvent: 6,
    minCutoffHoursBeforeEvent: 12,
    maxCutoffHoursBeforeEvent: 168,
    guidanceNote: null,
  }));

  assert.throws(() => parseAdminCancellationPolicyDraft({
    defaultCutoffHoursBeforeEvent: 200,
    minCutoffHoursBeforeEvent: 12,
    maxCutoffHoursBeforeEvent: 168,
    guidanceNote: null,
  }));

  assert.throws(() => parseAdminCancellationPolicyDraft({
    defaultCutoffHoursBeforeEvent: 24,
    minCutoffHoursBeforeEvent: 48,
    maxCutoffHoursBeforeEvent: 24,
    guidanceNote: null,
  }));

  assert.throws(() => parseAdminCancellationPolicyDraft({
    defaultCutoffHoursBeforeEvent: 12.5,
    minCutoffHoursBeforeEvent: 1,
    maxCutoffHoursBeforeEvent: 48,
    guidanceNote: null,
  }));
});

test("parseProviderCancellationPolicyDraft validates linked admin_default and bounded custom hours", () => {
  const adminPolicy = {
    ...seededAdminCancellationPolicy(),
    minCutoffHoursBeforeEvent: 12,
    defaultCutoffHoursBeforeEvent: 48,
    maxCutoffHoursBeforeEvent: 240,
  };

  assert.deepEqual(
    parseProviderCancellationPolicyDraft({mode: "admin_default"}, adminPolicy),
    {mode: "admin_default"},
  );

  assert.deepEqual(
    parseProviderCancellationPolicyDraft({mode: "provider_custom", cutoffHoursBeforeEvent: 36}, adminPolicy),
    {mode: "provider_custom", cutoffHoursBeforeEvent: 36},
  );

  assert.throws(() =>
    parseProviderCancellationPolicyDraft({mode: "provider_custom", cutoffHoursBeforeEvent: 6}, adminPolicy));

  assert.throws(() =>
    parseProviderCancellationPolicyDraft({mode: "provider_custom", cutoffHoursBeforeEvent: 300}, adminPolicy));

  assert.throws(() =>
    parseProviderCancellationPolicyDraft({mode: "admin_default", cutoffHoursBeforeEvent: 48}, adminPolicy));
});

test("resolveEffectiveCancellationPolicy dynamically links admin_default and preserves custom hours", () => {
  const adminV1 = {
    ...seededAdminCancellationPolicy(),
    policyVersion: 2,
    defaultCutoffHoursBeforeEvent: 96,
    guidanceNote: "Platform default guidance",
  };

  const linked = resolveEffectiveCancellationPolicy(
    {
      schemaVersion: 1,
      mode: "admin_default",
      policyVersion: 1,
      effectiveAt: Timestamp.fromMillis(Date.parse("2026-11-01T00:00:00Z")),
    },
    adminV1,
  );
  assert.equal(linked.sourceKind, "admin_default");
  assert.equal(linked.cutoffHoursBeforeEvent, 96);
  assert.equal(linked.adminPolicyVersion, 2);
  assert.equal(linked.providerPolicyVersion, 1);

  const fallback = resolveEffectiveCancellationPolicy(null, adminV1);
  assert.equal(fallback.sourceKind, "admin_default");
  assert.equal(fallback.cutoffHoursBeforeEvent, 96);
  assert.equal(fallback.providerPolicyVersion, null);

  const customStored = parseStoredProviderCancellationPolicy({
    schemaVersion: 1,
    mode: "provider_custom",
    cutoffHoursBeforeEvent: 18,
    policyVersion: 3,
    effectiveAt: Timestamp.fromMillis(Date.parse("2026-11-02T00:00:00Z")),
  });
  const custom = resolveEffectiveCancellationPolicy(customStored, adminV1);
  assert.equal(custom.sourceKind, "provider_custom");
  assert.equal(custom.cutoffHoursBeforeEvent, 18);
  assert.equal(custom.providerPolicyVersion, 3);
});

test("buildCancellationPolicySnapshot freezes cutoff and enforces hard cutoff in cancellationDeadline", () => {
  const adminPolicy = seededAdminCancellationPolicy();
  const effective = resolveEffectiveCancellationPolicy(null, adminPolicy);
  const eventStartAt = new Date("2026-12-10T06:00:00Z"); // 2:00 PM Manila
  const submittedNormal = new Date("2026-12-01T06:00:00Z");
  const snapshot = buildCancellationPolicySnapshot({
    effective,
    eventStartAt,
    submittedAt: submittedNormal,
    capturedAt: Timestamp.fromDate(submittedNormal),
  });

  assert.equal(snapshot.submittedPastCutoff, false);
  assert.equal(
    snapshot.cancellationCutoffAt.toDate().toISOString(),
    "2026-12-07T06:00:00.000Z",
  );
  assert.deepEqual(
    parseStoredCancellationPolicySnapshot(snapshot)?.cutoffHoursBeforeEvent,
    72,
  );

  const request = {
    eventDate: Timestamp.fromDate(new Date("2026-12-09T16:00:00Z")),
    eventTime: "14:00",
    eventEndTime: "18:00",
    cancellationPolicySnapshot: snapshot,
  };
  const parent = {
    eventDate: request.eventDate,
    eventTime: request.eventTime,
    eventEndTime: request.eventEndTime,
  };

  const beforeCutoff = cancellationDeadline(request, parent, new Date("2026-12-07T05:59:59Z"));
  assert.equal(beforeCutoff.reason, null);
  assert.equal(beforeCutoff.eligibilityExpiresInMs, 1000);
  assert.equal(beforeCutoff.cancellationCutoffAt, "2026-12-07T06:00:00.000Z");

  const atCutoff = cancellationDeadline(request, parent, new Date("2026-12-07T06:00:00Z"));
  assert.equal(atCutoff.reason, "CANCELLATION_CUTOFF_PASSED");
  assert.equal(atCutoff.eligibilityExpiresInMs, 0);

  const shortNoticeSnapshot = buildCancellationPolicySnapshot({
    effective,
    eventStartAt,
    submittedAt: new Date("2026-12-08T06:00:00Z"),
    capturedAt: Timestamp.fromDate(new Date("2026-12-08T06:00:00Z")),
  });
  assert.equal(shortNoticeSnapshot.submittedPastCutoff, true);

  const futureDate = Timestamp.fromDate(new Date(Date.now() + 24 * 3_600_000));
  const shortNoticeSchedule = {
    eventDate: futureDate,
    eventTime: "14:00",
    eventEndTime: "18:00",
  };
  assert.throws(
    () => assertNewCancellationBeforeEnd(
      {
        ...shortNoticeSchedule,
        cancellationPolicySnapshot: buildCancellationPolicySnapshot({
          effective,
          eventStartAt: futureDate.toDate(),
          submittedAt: new Date(),
          capturedAt: Timestamp.now(),
        }),
      },
      shortNoticeSchedule,
    ),
    (error) => error?.details?.reason === "CANCELLATION_CUTOFF_PASSED",
  );
});
