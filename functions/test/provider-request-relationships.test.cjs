const assert = require("node:assert/strict");
const test = require("node:test");
const {resolveProviderRequestRelationships: resolve} =
  require("../lib/provider-requests/provider-request-relationships.js");

const rid = (letter) => `request_${letter}`;
const stamp = (seconds) => ({seconds, nanoseconds: 123});
const scope = {
  eventDate: stamp(2000000000), eventType: "Wedding", eventTime: "10:00",
  eventEndTime: "14:00", eventLocation: "Venue", eventAddress: "Venue address", guestCount: 100,
};

function request(letter, previous) {
  return {id: rid(letter), data: {
    providerRequestId: rid(letter), mainEventId: "event_test", bookingId: "event_test",
    customerId: "customer_test", providerId: `provider_${letter}`, status: "pending",
    type: "addon", packageId: null, packageName: null, ...scope,
    services: [
      {serviceId: `service_${letter}_1`, name: "Photographer", category: "photography", price: 100},
      {serviceId: `service_${letter}_2`, name: "Video", category: "videography", price: 200},
    ],
    paymentStatus: "unpaid", paymentId: null, paidAt: null, requestedAt: stamp(1000),
    ...(previous ? {replacesProviderRequestId: rid(previous)} : {}),
  }};
}

function rejected(document) {
  Object.assign(document.data, {status: "rejected", replacementStatus: "required",
    rejectionReason: "Unavailable on this date", rejectedAt: stamp(500), respondedAt: stamp(500)});
  return document;
}

function fixture(version = 2, edges = []) {
  const linkedRequests = [request("A"), request("B"), request("C")];
  const active = [rid("A"), rid("B"), rid("C")];
  for (const [previous, next] of edges) {
    rejected(linkedRequests.find((doc) => doc.id === rid(previous)));
    linkedRequests.push(request(next, previous));
    active[active.indexOf(rid(previous))] = rid(next);
  }
  return {mainEventId: "event_test", mainEvent: {
    mainEventId: "event_test", bookingId: "event_test", customerId: "customer_test", ...scope,
    providerRequestIds: linkedRequests.map((doc) => doc.id),
    ...(version === undefined ? {} : {providerRequestRelationshipVersion: version}),
    ...(version === 2 ? {activeProviderRequestIds: active} : {}),
  }, linkedRequests};
}

function legacy() {
  const input = fixture(1);
  delete input.mainEvent.providerRequestRelationshipVersion;
  return input;
}

function fails(input, reason) {
  // Exact equality also asserts that failure never leaks partially active data.
  assert.deepEqual(resolve(input), {ok: false, reason});
}

test("valid legacy event defaults absent version to v1 with complete active membership", () => {
  const input = legacy();
  rejected(input.linkedRequests[2]);
  const result = resolve(input);
  assert.equal(result.ok, true);
  assert.equal(result.version, 1);
  assert.deepEqual(result.complete, input.mainEvent.providerRequestIds);
  assert.deepEqual(result.activeRequired, result.complete);
  assert.deepEqual(result.historical, []);
  assert.deepEqual([...result.rootByRequestId], result.complete.map((id) => [id, id]));
});

test("explicit v1 is supported", () => assert.equal(resolve(fixture(1)).version, 1));

for (const version of [1, 2]) {
  test(`v${version}: missing listed document fails complete membership`, () => {
    const input = fixture(version); input.linkedRequests.pop();
    fails(input, "complete-membership-mismatch");
  });
  test(`v${version}: unlisted linked document cannot be hidden`, () => {
    const input = fixture(version); input.linkedRequests.push(request("hidden"));
    fails(input, "complete-membership-mismatch");
  });
  test(`v${version}: duplicate linked document cannot stand in for missing document`, () => {
    const input = fixture(version); input.linkedRequests[2] = input.linkedRequests[1];
    fails(input, "complete-membership-mismatch");
  });
  test(`v${version}: duplicate complete IDs fail`, () => {
    const input = fixture(version); input.mainEvent.providerRequestIds.push(rid("A"));
    fails(input, "duplicate-provider-request-ids");
  });
  test(`v${version}: malformed complete IDs are never filtered or normalized`, () => {
    for (const ids of [undefined, null, "request_A", [], [null], [5], ["short"],
      [" request_A"], ["request_A "], ["request_A\n"], ["request/A"], ["x".repeat(161)],
      ["request_A", , "request_C"], ["request_A", {}]]) {
      const input = fixture(version); input.mainEvent.providerRequestIds = ids;
      fails(input, "malformed-provider-request-ids");
    }
  });
  test(`v${version}: request identities must match document, event and customer`, () => {
    for (const patch of [{providerRequestId: rid("other")}, {mainEventId: "event_other"},
      {bookingId: "event_other"}, {customerId: "customer_other"}, {providerId: " bad-id"},
      {providerId: undefined}, {customerId: undefined}, {bookingId: undefined}]) {
      const input = fixture(version); Object.assign(input.linkedRequests[0].data, patch);
      fails(input, "request-event-identity-mismatch");
    }
  });
  test(`v${version}: event identity cannot be inferred from request data`, () => {
    for (const patch of [{mainEventId: "event_other"}, {bookingId: "event_other"},
      {customerId: undefined}, {mainEventId: undefined}]) {
      const input = fixture(version); Object.assign(input.mainEvent, patch);
      fails(input, "request-event-identity-mismatch");
    }
    const input = fixture(version); input.mainEventId = " event_test";
    fails(input, "request-event-identity-mismatch");
  });
  test(`v${version}: malformed linked input fails closed`, () => {
    for (const docs of [null, {}, [null], [{id: rid("A"), data: null}],
      [{id: "bad/id", data: {}}], Array(3)]) {
      const input = fixture(version); input.linkedRequests = docs;
      assert.equal(resolve(input).ok, false);
    }
  });
  test(`v${version}: unknown request status fails closed`, () => {
    const input = fixture(version); input.linkedRequests[0].data.status = "invented";
    fails(input, "invalid-request-status");
  });
}

test("v1 rejects any presence of v2 projection or predecessor fields", () => {
  for (const explicit of [false, true]) {
    for (const value of [null, undefined, [], [rid("A")]]) {
      const input = explicit ? fixture(1) : legacy();
      input.mainEvent.activeProviderRequestIds = value;
      fails(input, "mixed-v1-v2-relationship-data");
    }
    for (const value of [null, undefined, rid("A"), ""]) {
      const input = explicit ? fixture(1) : legacy();
      input.linkedRequests[2].data.replacesProviderRequestId = value;
      fails(input, "mixed-v1-v2-relationship-data");
    }
  }
});

test("v2 originals have complete == active and no historical requests", () => {
  const input = fixture(); input.linkedRequests[1].data.replacesProviderRequestId = null;
  const result = resolve(input);
  assert.equal(result.ok, true); assert.equal(result.version, 2);
  assert.deepEqual(result.activeRequired, result.complete);
  assert.deepEqual(result.historical, []);
});

test("C -> D derives the replacement tip and historical ancestor", () => {
  const result = resolve(fixture(2, [["C", "D"]]));
  assert.equal(result.ok, true);
  assert.deepEqual(result.activeRequired, [rid("A"), rid("B"), rid("D")]);
  assert.deepEqual(result.historical, [rid("C")]);
});

test("C -> D -> E derives roots, full history, and attempts in chain order", () => {
  const result = resolve(fixture(2, [["C", "D"], ["D", "E"]]));
  assert.equal(result.ok, true);
  assert.deepEqual(result.complete, ["A", "B", "C", "D", "E"].map(rid));
  assert.deepEqual(result.activeRequired, ["A", "B", "E"].map(rid));
  assert.deepEqual(result.historical, ["C", "D"].map(rid));
  assert.deepEqual([...result.rootByRequestId], [
    [rid("A"), rid("A")], [rid("B"), rid("B")], [rid("C"), rid("C")],
    [rid("D"), rid("C")], [rid("E"), rid("C")],
  ]);
  assert.deepEqual([...result.attemptedProviderIdsByRoot], [
    [rid("A"), ["provider_A"]], [rid("B"), ["provider_B"]],
    [rid("C"), ["provider_C", "provider_D", "provider_E"]],
  ]);
});

test("root order comes from complete membership, not query or successor order", () => {
  const input = fixture(2, [["C", "D"], ["D", "E"], ["A", "F"]]);
  input.mainEvent.providerRequestIds = ["E", "C", "B", "F", "D", "A"].map(rid);
  input.mainEvent.activeProviderRequestIds = ["E", "B", "F"].map(rid);
  input.linkedRequests.reverse();
  const result = resolve(input);
  assert.equal(result.ok, true);
  assert.deepEqual(result.activeRequired, ["E", "B", "F"].map(rid));
  assert.deepEqual([...result.attemptedProviderIdsByRoot.keys()], ["C", "B", "A"].map(rid));
  assert.deepEqual(result.historical, ["C", "D", "A"].map(rid));
});

for (const [name, active] of [
  ["active order mismatch", ["A", "E", "B"]],
  ["stale historical predecessor", ["A", "B", "C"]],
  ["omitted chain tip", ["A", "B"]],
  ["extra historical predecessor", ["A", "B", "C", "E"]],
  ["unrelated active ID", ["A", "B", "unknown"]],
]) {
  test(`${name} fails projection equality`, () => {
    const input = fixture(2, [["C", "D"], ["D", "E"]]);
    input.mainEvent.activeProviderRequestIds = active.map(rid);
    fails(input, "active-set-mismatch");
  });
}

test("arbitrary removal has no authority, including a legitimately rejected tip", () => {
  for (const status of ["pending", "rejected", "expired", "cancelled"]) {
    const input = fixture(); rejected(input.linkedRequests[2]);
    input.linkedRequests[2].data.status = status;
    assert.equal(resolve(input).ok, true, "a failed original remains active");
    input.mainEvent.activeProviderRequestIds.pop();
    fails(input, "active-set-mismatch");
  }
});

test("missing listed predecessor fails", () => {
  const input = fixture(2, [["C", "D"]]);
  input.linkedRequests = input.linkedRequests.filter((doc) => doc.id !== rid("C"));
  fails(input, "missing-predecessor");
});

test("predecessor outside complete event membership fails", () => {
  const input = fixture(2, [["C", "D"]]);
  input.linkedRequests[3].data.replacesProviderRequestId = "request_other_event";
  fails(input, "predecessor-outside-event");
});

test("cross-event predecessor document fails identity even when listed", () => {
  const input = fixture(2, [["C", "D"]]);
  input.linkedRequests[2].data.mainEventId = "event_other";
  fails(input, "request-event-identity-mismatch");
});

test("self predecessor fails", () => {
  const input = fixture(); input.linkedRequests[2].data.replacesProviderRequestId = rid("C");
  fails(input, "self-predecessor");
});

test("malformed predecessor is never interpreted as an original", () => {
  for (const value of ["", " request_C", "request_C/child", 42, [], {}]) {
    const input = fixture(); input.linkedRequests[2].data.replacesProviderRequestId = value;
    fails(input, "malformed-predecessor");
  }
});

test("disconnected cycle fails even alongside valid roots", () => {
  const input = fixture(2, [["C", "D"], ["D", "E"]]);
  input.linkedRequests[2].data.replacesProviderRequestId = rid("E");
  fails(input, "cycle");
});

test("all-cyclic membership fails", () => {
  const input = fixture();
  for (const [index, previous] of [[0, "C"], [1, "A"], [2, "B"]]) {
    input.linkedRequests[index].data.replacesProviderRequestId = rid(previous);
  }
  fails(input, "cycle");
});

test("fork cannot split a whole assignment between replacement providers", () => {
  const input = fixture(2, [["C", "D"]]); input.linkedRequests.push(request("E", "C"));
  input.mainEvent.providerRequestIds.push(rid("E"));
  fails(input, "fork");
});

test("provider cannot be reused anywhere in the same chain", () => {
  for (const providerId of ["provider_C", "provider_D"]) {
    const input = fixture(2, [["C", "D"], ["D", "E"]]);
    input.linkedRequests[4].data.providerId = providerId;
    fails(input, "provider-reuse-in-chain");
  }
});

test("provider reuse prohibition is scoped to each chain", () => {
  const input = fixture(2, [["C", "D"]]); input.linkedRequests[3].data.providerId = "provider_A";
  assert.equal(resolve(input).ok, true);
});

test("expired predecessor fails even with rejected evidence or invented expiry discriminator", () => {
  const input = fixture(2, [["C", "D"]]);
  Object.assign(input.linkedRequests[2].data, {status: "expired", expirationReason: "provider_response"});
  fails(input, "invalid-supersession");
});

test("non-rejected states cannot authorize supersession", () => {
  for (const status of ["pending", "accepted", "waiting_for_down_payment", "payment_processing",
    "confirmed", "in_progress", "completed", "cancelled"]) {
    const input = fixture(2, [["C", "D"]]); input.linkedRequests[2].data.status = status;
    fails(input, "invalid-supersession");
  }
});

test("rejected status alone and malformed or contradictory rejection evidence fail", () => {
  for (const patch of [{replacementStatus: undefined}, {rejectedAt: undefined},
    {respondedAt: stamp(499)}, {rejectionReason: ""}, {paymentStatus: "paid"},
    {paidAt: stamp(100)}, {paymentId: "payment_test"}, {confirmedAt: stamp(100)},
    {cancelledAt: stamp(100)}, {completedAt: stamp(100)},
    {rejectedAt: {seconds: 500, nanoseconds: 1e9}}, {rejectedAt: new Date()},
    {rejectedAt: stamp(2000), respondedAt: stamp(2000)}]) {
    const input = fixture(2, [["C", "D"]]); Object.assign(input.linkedRequests[2].data, patch);
    fails(input, "invalid-supersession");
  }
  const input = fixture(2, [["C", "D"]]); delete input.linkedRequests[3].data.requestedAt;
  fails(input, "invalid-supersession");
});

test("whole assignment type, categories, and multiplicities must remain compatible", () => {
  for (const mutate of [
    (data) => {data.type = "catering";},
    (data) => {data.services.pop();},
    (data) => {data.services[1].category = "photography";},
    (data) => {data.services.push({...data.services[0], serviceId: "service_extra"});},
    (data) => {data.services[1].serviceId = data.services[0].serviceId;},
    (data) => {data.services = undefined;},
    (data) => {data.services = [null];},
    (data) => {data.services[0].category = "";},
    (data) => {data.packageId = "package_unexpected";},
  ]) {
    const input = fixture(2, [["C", "D"]]); mutate(input.linkedRequests[3].data);
    fails(input, "incompatible-assignment");
  }
});

test("event scope snapshots must match both sides and the parent", () => {
  for (const field of Object.keys(scope)) {
    for (const index of [2, 3]) {
      const input = fixture(2, [["C", "D"]]);
      input.linkedRequests[index].data[field] = field === "eventDate" ? stamp(1999) : "changed";
      fails(input, "incompatible-assignment");
    }
    const input = fixture(2, [["C", "D"]]); delete input.mainEvent[field];
    fails(input, "incompatible-assignment");
  }
});

test("new provider-specific catalog IDs, service order and commercial terms are independent", () => {
  const input = fixture(2, [["C", "D"]]);
  const next = input.linkedRequests[3].data;
  next.services.reverse(); next.services[0].price = 999; next.services[0].name = "New offer";
  next.amount = 4567; next.downPaymentPercentage = 40; next.refundPolicySnapshot = {version: 2};
  assert.equal(resolve(input).ok, true);
  assert.equal(input.linkedRequests[2].data.services[0].price, 100);
});

test("catering bundle supports a different package but preserves every bundled category", () => {
  const input = fixture(2, [["C", "D"]]);
  for (const doc of input.linkedRequests.slice(2)) {
    Object.assign(doc.data, {type: "catering", packageId: `package_${doc.id}`,
      packageName: `Package ${doc.id}`});
    doc.data.services.unshift({serviceId: doc.data.packageId, name: doc.data.packageName,
      category: "catering_package", price: 1000});
  }
  assert.equal(resolve(input).ok, true);
  input.linkedRequests[3].data.services.pop(); fails(input, "incompatible-assignment");
});

test("invalid catering package linkage cannot establish continuity", () => {
  const input = fixture(2, [["C", "D"]]);
  for (const doc of input.linkedRequests.slice(2)) {
    Object.assign(doc.data, {type: "catering", packageId: "package_unknown", packageName: "Package"});
  }
  fails(input, "incompatible-assignment");
});

test("unknown relationship versions fail closed without falling back to legacy", () => {
  for (const version of [0, 3, -1, "1", "2", null, {}, NaN]) {
    const input = fixture(); input.mainEvent.providerRequestRelationshipVersion = version;
    fails(input, "unsupported-relationship-version");
  }
});

test("v2 requires its active projection", () => {
  const input = fixture(); delete input.mainEvent.activeProviderRequestIds;
  fails(input, "missing-active-provider-request-ids");
});

test("malformed active IDs cannot be normalized into validity", () => {
  for (const active of [undefined, null, [], "request_A", [null], [42], ["short"],
    [" request_A"], ["request_A\n"], ["request_A", , "request_C"]]) {
    const input = fixture(); input.mainEvent.activeProviderRequestIds = active;
    fails(input, "malformed-active-provider-request-ids");
  }
});

test("duplicate active tips fail even if the unique set would match", () => {
  const input = fixture(2, [["C", "D"], ["D", "E"]]);
  input.mainEvent.activeProviderRequestIds.push(rid("E"));
  fails(input, "duplicate-active-provider-request-ids");
});

test("long histories are neither truncated nor subject to recursion or small attempt caps", () => {
  const input = fixture(); let previous = input.linkedRequests[2];
  for (let i = 0; i < 12000; i++) {
    rejected(previous);
    const next = request(`long_${i}`); next.data.replacesProviderRequestId = previous.id;
    input.linkedRequests.push(next); input.mainEvent.providerRequestIds.push(next.id); previous = next;
  }
  input.mainEvent.activeProviderRequestIds[2] = previous.id;
  const result = resolve(input);
  assert.equal(result.ok, true); assert.equal(result.complete.length, 12003);
  assert.equal(result.historical.length, 12000);
  assert.equal(result.attemptedProviderIdsByRoot.get(rid("C")).length, 12001);
});

test("resolver accepts frozen input and returns detached relationship collections", () => {
  const input = fixture(2, [["C", "D"], ["D", "E"]]);
  const before = structuredClone(input);
  function freeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
  }
  freeze(input);
  const result = resolve(input); assert.equal(result.ok, true);
  result.complete.pop(); result.activeRequired.pop(); result.historical.pop();
  result.rootByRequestId.clear(); result.attemptedProviderIdsByRoot.get(rid("C")).pop();
  assert.deepEqual(input, before);
  assert.deepEqual(resolve(input).activeRequired, ["A", "B", "E"].map(rid));
});
