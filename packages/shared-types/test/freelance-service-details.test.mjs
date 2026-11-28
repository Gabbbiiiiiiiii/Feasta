import assert from "node:assert/strict";
import test from "node:test";
import {parseFreelanceServiceDetails, readFreelanceServiceDetails} from "../dist/freelance-service-details.cjs";

const details = {
  deliverables: [{id: "gallery", name: " Full gallery ", min: 2, max: 3, unit: "weeks", method: "gallery"}],
  collaboration: "direct",
  collaborationNotes: "Planning call included",
  addOns: [{id: "coverage", name: "Extra coverage", priceCentavos: 150000, unit: "hour"}],
  travelZones: [{id: "lake", name: "Lake Danao", mode: "quote_required", feeCentavos: null}],
};

test("freelance service terms round-trip while missing terms remain optional", () => {
  assert.equal(parseFreelanceServiceDetails(undefined), null);
  const parsed = parseFreelanceServiceDetails(details);
  assert.equal(parsed.deliverables[0].name, "Full gallery");
  assert.deepEqual(readFreelanceServiceDetails(parsed), parsed);
});

test("rejects inverted deadlines, fractional centavos, and a fixed travel fee without a price", () => {
  for (const invalid of [
    {...details, deliverables: [{...details.deliverables[0], max: 1}]},
    {...details, addOns: [{...details.addOns[0], priceCentavos: 1.5}]},
    {...details, travelZones: [{...details.travelZones[0], mode: "fixed_fee"}]},
  ]) {
    assert.throws(() => parseFreelanceServiceDetails(invalid));
    assert.equal(readFreelanceServiceDetails(invalid), null);
  }
});

test("keeps structured coverage, inclusions and planning with a freelance listing", () => {
  const listing = {
    ...details,
    coverageMinutes: 360,
    inclusions: [
      {id: "session", label: "Pre-debut session", kind: "session"},
      {id: "photobook", label: "Hardcover photobook", kind: "keepsake"},
    ],
    planning: {consultationIncluded: true, customShotListIncluded: true},
  };
  const parsed = parseFreelanceServiceDetails(listing);
  assert.equal(parsed.coverageMinutes, 360);
  assert.deepEqual(parsed.inclusions, listing.inclusions);
  assert.deepEqual(parsed.planning, listing.planning);
  assert.throws(() => parseFreelanceServiceDetails({...listing, coverageMinutes: 0}));
});

test("supports an optional distance surcharge without changing existing coverage", () => {
  const rule = {from: " Ormoc City Hall ", afterKm: 20, feeCentavos: 100000};
  assert.equal(parseFreelanceServiceDetails(details).distanceSurcharge, undefined);
  const parsed = parseFreelanceServiceDetails({...details, distanceSurcharge: rule});
  assert.deepEqual(parsed.distanceSurcharge, {...rule, from: "Ormoc City Hall"});
  assert.deepEqual(parsed.travelZones, details.travelZones);
  assert.throws(() => parseFreelanceServiceDetails({...details, distanceSurcharge: {...rule, afterKm: 0}}));
  assert.throws(() => parseFreelanceServiceDetails({...details, distanceSurcharge: {...rule, feeCentavos: 0}}));
});
