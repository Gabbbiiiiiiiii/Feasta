const assert = require("node:assert/strict");
const test = require("node:test");
const {
  parseAgreementText,
  validateAgreementSections,
  agreementSectionsToText,
} = require("../lib/shared/agreement-text.js");

for (const heading of ["# 1. ABOUT", "## 1. ABOUT", "1. ABOUT"]) {
  test(`normalizes heading ${heading}`, () => {
    const result = parseAgreementText(`${heading}\n\nParagraph.`);
    assert.equal(result.normalizedText, "# 1. ABOUT\n\nParagraph.");
    assert.deepEqual(result.sections, [{title: "1. ABOUT", paragraphs: ["Paragraph."]}]);
    assert.deepEqual(validateAgreementSections(result.sections), result.sections);
  });
}

for (const heading of [
  "1. FEASTA AND THE PROVIDER", "SECTION 1 - FEASTA AND THE PROVIDER",
  "Before You Continue", "PROVIDER ACKNOWLEDGMENT", "ELECTRONIC ACCEPTANCE",
]) {
  test(`recognizes ${heading} without changing its wording`, () => {
    assert.equal(parseAgreementText(`${heading}\nTerms.`).normalizedText, `# ${heading}\n\nTerms.`);
  });
}

test("numbered statements and bullet items remain readable content", () => {
  const list = [
    "1. FEASTA is a student-developed platform.",
    "2. The Provider remains responsible for its services.",
    "3. FEASTA may preserve transaction records.",
    ...Array.from({length: 17}, (_, index) => `${index + 4}. The Provider shall comply.`),
  ].join("\n");
  const bullets = "Provider must not:\n- provide false information;\n- submit fabricated documents;\n• misuse customer information.";
  const result = parseAgreementText(`PROVIDER ACKNOWLEDGMENT\n${list}\n\n${bullets}`);
  assert.deepEqual(result.sections, [{title: "PROVIDER ACKNOWLEDGMENT", paragraphs: [list, bullets]}]);
});

test("ordinary text gets a fallback, with CRLF, CR and blank lines cleaned", () => {
  const result = parseAgreementText("  Provider shall pay PHP 10,000.  \r\n\r\n\r\nOne event per day.\rDate: 2026-09-30.  ");
  assert.equal(result.normalizedText, "# Agreement\n\nProvider shall pay PHP 10,000.\n\nOne event per day.\nDate: 2026-09-30.");
  assert.equal(parseAgreementText(result.normalizedText).normalizedText, result.normalizedText);
});

test("uppercase numbered sentences are not section headings", () => {
  assert.equal(parseAgreementText("1. THE PROVIDER SHALL PAY.\n2. NO REFUNDS;").sections[0].title, "Agreement");
});

test("consecutive uppercase numbered list items remain content", () => {
  for (const separator of ["\n", "\n\n"]) {
    const body = ["Provider must submit:", "1. PHOTO ID", "2. TAX ID", "3. BUSINESS PERMIT"].join(separator);
    const result = parseAgreementText(body);
    assert.equal(result.sections.length, 1);
    assert.equal(result.sections[0].title, "Agreement");
    assert.equal(result.sections[0].paragraphs.join(separator), body);
    assert.deepEqual(parseAgreementText(result.normalizedText), result);
  }
});

test("a heading without body remains usable content", () => {
  const result = parseAgreementText("PROVIDER ACKNOWLEDGMENT");
  assert.deepEqual(result.sections, [
    {title: "Agreement", paragraphs: ["PROVIDER ACKNOWLEDGMENT"]},
  ]);
  assert.deepEqual(parseAgreementText(result.normalizedText), result);
});

for (const [kind, text] of [
  ["sentences", "The Provider shall pay PHP 10,000 on 2026-09-30. ".repeat(110).trim()],
  ["list boundaries", Array.from({length: 50}, (_, i) => `${i + 1}. The Provider shall preserve every name, amount and legal term exactly.`).join("\n")],
  ["whitespace", "unchangedLegalWord ".repeat(250).trim()],
  ["unbroken token", "Z".repeat(4001)],
  ["unicode token", "Z" + "😀".repeat(1500)],
]) {
  test(`splits long ${kind} without losing wording or punctuation`, () => {
    const result = parseAgreementText(text);
    const paragraphs = result.sections.flatMap((section) => section.paragraphs);
    assert.ok(paragraphs.length > 1);
    assert.ok(paragraphs.every((paragraph) => paragraph.length <= 2000));
    assert.equal(paragraphs.join("").replace(/\s/gu, ""), text.replace(/\s/gu, ""));
    assert.deepEqual(validateAgreementSections(result.sections), result.sections);
    assert.equal(parseAgreementText(result.normalizedText).normalizedText, result.normalizedText);
    if (kind === "sentences") assert.ok(paragraphs.every((paragraph) => paragraph.endsWith(".")));
    if (kind === "list boundaries") assert.ok(paragraphs.every((paragraph) => /^\d+\./u.test(paragraph)));
  });
}

test("packs excess small paragraphs without dropping their blank lines", () => {
  const text = Array.from({length: 20}, (_, i) => `Clause ${i + 1}.`).join("\n\n");
  const result = parseAgreementText(text);
  assert.ok(result.sections[0].paragraphs.length <= 12);
  assert.equal(result.sections[0].paragraphs.join("\n\n"), text);
  assert.deepEqual(parseAgreementText(result.normalizedText), result);
});

for (const separator of [" ", "\n\n"]) {
  test(`reflows safe wording when preferred boundaries exceed 12 paragraphs (${JSON.stringify(separator)})`, () => {
    const sentence = "The Provider shall pay PHP 10,000 ".repeat(35).trim() + ".";
    const body = Array(19).fill(sentence).join(separator);
    // More than 12 preferred chunks, but within the actual 24,000-character capacity.
    const shorter = body.trim();
    const result = parseAgreementText(shorter);
    const paragraphs = result.sections[0].paragraphs;
    assert.ok(paragraphs.length <= 12);
    assert.ok(paragraphs.every((paragraph) => paragraph.length <= 2000));
    assert.equal(paragraphs.join(" ").replace(/\s+/gu, " "), shorter.replace(/\s+/gu, " "));
    assert.deepEqual(validateAgreementSections(result.sections), result.sections);
    assert.deepEqual(parseAgreementText(result.normalizedText), result);
  });
}

test("accepts 12 paragraphs in one section", () => {
  const text = Array.from({length: 12}, (_, index) => `Clause ${index + 1} stands alone.`).join("\n\n");
  const result = parseAgreementText(text);
  assert.equal(result.sections[0].paragraphs.length, 12);
  assert.deepEqual(validateAgreementSections(result.sections), result.sections);
});

test("keeps genuine section, heading, and paragraph capacity limits", () => {
  assert.throws(() => parseAgreementText(" \r\n\t "), /Enter agreement text\./);
  const sectionText = Array.from({length: 41}, (_, i) => `# ${i + 1}. TERMS\n\nTerms.`).join("\n\n");
  assert.throws(() => parseAgreementText(sectionText), /more than 40 sections/);
  assert.throws(() => parseAgreementText("# " + "H".repeat(161) + "\nTerms."), /between 2 and 160/);
  assert.throws(() => parseAgreementText("word ".repeat(5000)), /12-paragraph capacity/);
  assert.equal(parseAgreementText(sectionText.split("\n\n# 41.")[0]).sections.length, 40);
});

test("canonical validator rejects malformed direct submissions", () => {
  for (const value of [
    null, [], [null], [{title: "Terms", paragraphs: []}],
    [{title: "Terms", paragraphs: [false]}], [{title: "Terms", paragraphs: [" "]}],
    [{title: "Terms", paragraphs: ["x".repeat(2001)]}],
    [{title: "Terms", paragraphs: Array(13).fill("Terms.")}],
  ]) assert.throws(() => validateAgreementSections(value));
});

test("correctly formatted agreements round-trip without wording changes", () => {
  const sections = [
    {title: "1. PAYMENT", paragraphs: ["The Provider shall pay PHP 10,000 to FEASTA on 2026-09-30.", "Only one event per day.\nNames: María and O’Neil."]},
    {title: "Electronic Acceptance", paragraphs: ["I agree; I do not waive any other rights."]},
  ];
  const canonical = agreementSectionsToText(sections);
  assert.deepEqual(parseAgreementText(canonical), {normalizedText: canonical, sections});
});
