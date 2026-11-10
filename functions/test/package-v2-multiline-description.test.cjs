"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {plainText} = require("../lib/packages/v2-validation.js");

const source = fs.readFileSync(
  path.join(__dirname, "../src/packages/provider-package-drafts-v2.ts"),
  "utf8"
);

function validateDescription(value) {
  if (typeof value !== "string") {
    throw new Error("INVALID_NAME");
  }

  // Mirrors the reviewed expression in parseV2DraftWrite.
  plainText(
    value.replace(/\r\n|\n/gu, ""),
    10,
    5000,
    "INVALID_NAME"
  );

  return value;
}

test("V2 draft parser contains the reviewed description validation", () => {
  assert.ok(
    source.includes(
      'plainText(input.description.replace(/\\r\\n|\\n/gu, ""), 10, 5000, "INVALID_NAME");'
    )
  );
});

test("single-line description remains valid", () => {
  const value = "A complete catering package.";
  assert.equal(validateDescription(value), value);
});

test("LF paragraphs are accepted and preserved exactly", () => {
  const value = "First paragraph.\n\nSecond paragraph.";
  assert.equal(validateDescription(value), value);
});

test("CRLF paragraphs are accepted and preserved exactly", () => {
  const value = "First paragraph.\r\n\r\nSecond paragraph.";
  assert.equal(validateDescription(value), value);
});

test("standalone carriage return is rejected", () => {
  assert.throws(() =>
    validateDescription("First paragraph.\rSecond paragraph.")
  );
});

test("tab control character is rejected", () => {
  assert.throws(() =>
    validateDescription("First paragraph.\tSecond paragraph.")
  );
});

test("zero-width character is rejected", () => {
  assert.throws(() =>
    validateDescription("First paragraph.\u200BSecond paragraph.")
  );
});

test("malformed UTF-16 surrogate is rejected", () => {
  assert.throws(() =>
    validateDescription("First paragraph.\uD800Second paragraph.")
  );
});

test("description shorter than minimum is rejected", () => {
  assert.throws(() => validateDescription("Short"));
});

test("name validation continues rejecting newlines", () => {
  assert.throws(() =>
    plainText("Invalid\nPackage", 2, 80, "INVALID_NAME")
  );
});