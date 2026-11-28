"use strict";

const assert = require("node:assert/strict");
const {test} = require("node:test");
const {parsePackageClassification} =
  require("../lib/packages/package-classification.js");

const parse = parsePackageClassification;

function rejects(value, reason) {
  assert.throws(
    () => parse(value),
    (error) =>
      error.code === "invalid-argument" &&
      error.details?.reason === reason,
  );
}

test("historical packages can omit classification", () => {
  assert.deepEqual(parse({}), {});
});

test("all three package structures are accepted", () => {
  for (const structure of ["fixed", "customizable", "individual"]) {
    assert.deepEqual(
      parse({offerStructure: structure}),
      {offerStructure: structure},
    );
  }
});

test("provider-defined styles persist without a fixed catalog", () => {
  assert.deepEqual(
    parse({offerStructure: "fixed", packageStyle: "Grazing Table"}),
    {offerStructure: "fixed", packageStyle: "Grazing Table"},
  );
  assert.deepEqual(
    parse({packageStyle: "Signature Lechon Package"}),
    {packageStyle: "Signature Lechon Package"},
  );
});

test("invalid structures are rejected", () => {
  for (const value of ["unknown", "", null, 3, true]) {
    rejects(
      {offerStructure: value},
      "INVALID_OFFER_STRUCTURE",
    );
  }
});

test("invalid package styles are rejected", () => {
  for (const value of [
    "",
    "A",
    " Leading space",
    "Trailing space ",
    "x".repeat(81),
    123,
    null,
    "Hidden\u200BCharacter",
    "Line\nBreak",
  ]) {
    rejects({packageStyle: value}, "INVALID_PACKAGE_STYLE");
  }
});

test("valid boundary lengths are accepted", () => {
  assert.equal(parse({packageStyle: "AB"}).packageStyle, "AB");
  assert.equal(
    parse({packageStyle: "x".repeat(80)}).packageStyle.length,
    80,
  );
});
