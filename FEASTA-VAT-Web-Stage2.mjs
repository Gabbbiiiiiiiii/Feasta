
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync, spawnSync} from "node:child_process";

const root = "C:\\flutterProject\\feasta";
const expectedHead =
  "2d512094f61a999aae87994317a7bd6122fb4092";

const reviewFile =
  "apps/web/src/components/customer/bookings/event-customization-experience.tsx";

const clientFile =
  "apps/web/src/lib/customer/bookings/customer-provider-vat-preview-client.ts";

const mathFile =
  "apps/web/src/lib/customer/bookings/customer-provider-vat-breakdown.ts";

const testFile =
  "apps/web/test/components/customer-provider-vat-breakdown.test.ts";

const backendFile =
  "functions/src/providers/customer-provider-tax-preview.ts";

const newFiles = [clientFile, mathFile, testFile];
const targetFiles = [reviewFile, ...newFiles];

process.chdir(root);

function command(file, args) {
  return execFileSync(file, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  }).trim();
}

function run(label, file, args) {
  console.log(`\n=== ${label} ===`);

  const result = spawnSync(file, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} failed.`);
  }
}

function absolute(relative) {
  return path.join(root, relative);
}

function requireFile(relative) {
  if (!fs.existsSync(absolute(relative))) {
    throw new Error(`Missing required file: ${relative}`);
  }
}

function replaceOnce(source, before, after, name) {
  const first = source.indexOf(before);

  if (first < 0) {
    throw new Error(`Source anchor missing: ${name}`);
  }

  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`Source anchor duplicated: ${name}`);
  }

  return (
    source.slice(0, first) +
    after +
    source.slice(first + before.length)
  );
}

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}

function preserveLineEndings(text, original) {
  return original.includes("\r\n")
    ? text.replace(/\n/g, "\r\n")
    : text;
}

console.log("\n=== FEASTA VAT PREVIEW — STAGE 2 WEB ===");

// ============================================================
// 1. VERIFY REPOSITORY AND PROTECT EXISTING CHANGES
// ============================================================

console.log("\n=== 1. VERIFY REPOSITORY ===");

const branch = command("git", ["branch", "--show-current"]);
const head = command("git", ["rev-parse", "HEAD"]);

if (branch !== "chore/monorepo-setup") {
  throw new Error(`Unexpected branch: ${branch}`);
}

if (head !== expectedHead) {
  throw new Error(`Unexpected HEAD: ${head}`);
}

requireFile(reviewFile);
requireFile(backendFile);

for (const file of targetFiles) {
  const status = command("git", [
    "status",
    "--porcelain",
    "--",
    file,
  ]);

  if (status.length > 0) {
    throw new Error(`Target already modified: ${file}`);
  }
}

for (const file of newFiles) {
  if (fs.existsSync(absolute(file))) {
    throw new Error(`Target already exists: ${file}`);
  }
}

console.log("PASS: Correct branch, HEAD, and source scope.");
console.log("PASS: Stage 1 backend exists.");

// ============================================================
// 2. READ WEB BOOKING REVIEW
// ============================================================

console.log("\n=== 2. PREPARE BOOKING REVIEW ===");

const originalBytes = fs.readFileSync(absolute(reviewFile));
const originalReview = originalBytes.toString("utf8");

let updated = normalize(originalReview);

// ============================================================
// IMPORT VAT HELPERS
// ============================================================

updated = replaceOnce(
  updated,
  'import {PriceDisplay} from "@/components/shared/price-display";',
  [
    'import {PriceDisplay} from "@/components/shared/price-display";',
    'import {getCustomerProviderTaxPreview} from "@/lib/customer/bookings/customer-provider-vat-preview-client";',
    'import {customerProviderVatBreakdown, type CustomerProviderTaxStatus} from "@/lib/customer/bookings/customer-provider-vat-breakdown";',
  ].join("\n"),
  "VAT helper imports",
);

// ============================================================
// PASS PROVIDER ID TO THE EXACT BOOKING REVIEW
// ============================================================

updated = replaceOnce(
  updated,
  [
    "            <BookingReview",
    "              packageRecord={packageRecord}",
    "              providerName={provider.businessName}",
    "              eventDraft={draft}",
  ].join("\n"),
  [
    "            <BookingReview",
    "              packageRecord={packageRecord}",
    "              providerName={provider.businessName}",
    "              providerId={provider.id}",
    "              eventDraft={draft}",
  ].join("\n"),
  "BookingReview provider identity",
);

// ============================================================
// ADD PROVIDER ID TO BOOKING REVIEW ARGUMENTS
// ============================================================

updated = replaceOnce(
  updated,
  [
    "function BookingReview({",
    "  packageRecord,",
    "  providerName,",
    "  eventDraft,",
  ].join("\n"),
  [
    "function BookingReview({",
    "  packageRecord,",
    "  providerName,",
    "  providerId,",
    "  eventDraft,",
  ].join("\n"),
  "BookingReview arguments",
);

updated = replaceOnce(
  updated,
  [
    "  providerName: string;",
    "",
    "  eventDraft:",
  ].join("\n"),
  [
    "  providerName: string;",
    "  providerId: string;",
    "",
    "  eventDraft:",
  ].join("\n"),
  "BookingReview parameter types",
);

// ============================================================
// REACT VAT STATE — NO SYNCHRONOUS SETSTATE IN USEEFFECT
// ============================================================

const oldCalculation = [
  "}) {",
  "  const estimatedTotal =",
  "    displayedServicePrice !== null",
].join("\n");

const newCalculation = [
  "}) {",
  "  const [taxResult, setTaxResult] = useState<{",
  "    providerId: string;",
  "    status: CustomerProviderTaxStatus;",
  "  } | null>(null);",
  "",
  "  useEffect(() => {",
  "    let active = true;",
  "",
  "    void getCustomerProviderTaxPreview(providerId)",
  "      .then((preview) => {",
  "        if (active) {",
  "          setTaxResult({",
  "            providerId,",
  "            status: preview.taxStatus,",
  "          });",
  "        }",
  "      })",
  "      .catch(() => {",
  "        if (active) {",
  "          setTaxResult({",
  "            providerId,",
  '            status: "unknown",',
  "          });",
  "        }",
  "      });",
  "",
  "    return () => {",
  "      active = false;",
  "    };",
  "  }, [providerId]);",
  "",
  "  const taxStatus =",
  "    taxResult?.providerId === providerId",
  "      ? taxResult.status",
  "      : null;",
  "",
  "  const vatBreakdown = customerProviderVatBreakdown(",
  "    displayedServicePrice,",
  "    taxStatus,",
  "  );",
  "",
  "  const estimatedTotal =",
  "    displayedServicePrice !== null",
].join("\n");

updated = replaceOnce(
  updated,
  oldCalculation,
  newCalculation,
  "React VAT calculation",
);

// ============================================================
// ADD VAT SECTION BEFORE ESTIMATED TOTAL
// ============================================================

const oldEstimate = [
  '            <EstimateRow label="Selected FEASTA services" value={selectedEventServicesSubtotal} />',
  '            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-feasta-divider pt-4">',
].join("\n");

const vatSection = [
  '            <EstimateRow label="Selected FEASTA services" value={selectedEventServicesSubtotal} />',
  "",
  "            <div",
  '              aria-label="Estimated provider tax breakdown"',
  '              className="rounded-xl border border-feasta-divider bg-secondary/40 p-3"',
  "            >",
  "              {taxStatus === null ? (",
  '                <p className="text-sm text-feasta-text-secondary">',
  "                  Checking provider tax verification...",
  "                </p>",
  "              ) : vatBreakdown ? (",
  '                <div className="grid gap-3">',
  "                  <EstimateRow",
  '                    label="VAT-exclusive service amount"',
  "                    value={vatBreakdown.exclusiveCentavos / 100}",
  "                  />",
  "                  <EstimateRow",
  '                    label="Estimated provider VAT (12% included)"',
  "                    value={vatBreakdown.vatCentavos / 100}",
  "                  />",
  '                  <p className="text-xs text-feasta-text-secondary">',
  "                    VAT is already included in this provider&apos;s",
  "                    service price, not added to your booking total.",
  "                    The final tax snapshot is set when the provider accepts.",
  "                  </p>",
  "                </div>",
  "              ) : (",
  '                <p className="text-sm text-feasta-text-secondary">',
  '                  {taxStatus === "non_vat"',
  '                    ? "Non-VAT provider. No provider VAT component is displayed."',
  '                    : "Provider VAT breakdown is not confirmed. Final tax details are determined when the provider accepts."}',
  "                </p>",
  "              )}",
  "            </div>",
  "",
  '            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-feasta-divider pt-4">',
].join("\n");

updated = replaceOnce(
  updated,
  oldEstimate,
  vatSection,
  "Booking estimate VAT display",
);

updated = preserveLineEndings(updated, originalReview);

console.log("PASS: Web booking review anchors verified.");

// ============================================================
// 3. CREATE PURE VAT CALCULATION HELPER
// ============================================================

console.log("\n=== 3. PREPARE VAT MATH ===");

const mathText = [
  'export type CustomerProviderTaxStatus =',
  '  "vat_registered" | "non_vat" | "unknown";',
  "",
  "/**",
  " * Customer-facing estimate only.",
  " * The authoritative VAT ledger remains server-controlled.",
  " */",
  "export function customerProviderVatBreakdown(",
  "  servicePrice: number | null,",
  "  taxStatus: CustomerProviderTaxStatus | null,",
  "): {",
  "  exclusiveCentavos: number;",
  "  vatCentavos: number;",
  "} | null {",
  "  if (",
  '    taxStatus !== "vat_registered" ||',
  "    servicePrice === null ||",
  "    !Number.isFinite(servicePrice) ||",
  "    servicePrice < 0",
  "  ) {",
  "    return null;",
  "  }",
  "",
  "  const grossCentavos = Math.round(servicePrice * 100);",
  "",
  "  if (",
  "    !Number.isSafeInteger(grossCentavos) ||",
  "    grossCentavos < 0 ||",
  "    !Number.isSafeInteger(grossCentavos * 1200)",
  "  ) {",
  "    return null;",
  "  }",
  "",
  "  const vatCentavos = Math.round(",
  "    grossCentavos * 1200 / 11200,",
  "  );",
  "",
  "  return {",
  "    exclusiveCentavos: grossCentavos - vatCentavos,",
  "    vatCentavos,",
  "  };",
  "}",
  "",
].join("\n");

// ============================================================
// 4. CREATE FIREBASE CLIENT LOOKUP
// ============================================================

console.log("\n=== 4. PREPARE FIREBASE CLIENT ===");

const clientText = [
  '"use client";',
  "",
  'import {httpsCallable} from "firebase/functions";',
  "",
  "import {",
  "  functions,",
  "  initializeBrowserAppCheck,",
  '} from "@/lib/firebase/client";',
  "",
  "import type {",
  "  CustomerProviderTaxStatus,",
  '} from "./customer-provider-vat-breakdown";',
  "",
  "type CustomerProviderTaxPreview = {",
  "  providerId: string;",
  "  taxStatus: CustomerProviderTaxStatus;",
  "  vatRateBps: number;",
  "};",
  "",
  "export async function getCustomerProviderTaxPreview(",
  "  providerId: string,",
  "): Promise<CustomerProviderTaxPreview> {",
  "  if (!/^[A-Za-z0-9_-]{1,160}$/u.test(providerId)) {",
  '    throw new Error("Invalid provider.");',
  "  }",
  "",
  "  initializeBrowserAppCheck();",
  "",
  "  const callable = httpsCallable<",
  "    {providerId: string},",
  "    CustomerProviderTaxPreview",
  "  >(",
  "    functions,",
  '    "getCustomerProviderTaxPreview",',
  "  );",
  "",
  "  const {data} = await callable({providerId});",
  "",
  "  if (",
  "    !data ||",
  "    data.providerId !== providerId ||",
  "    (",
  '      data.taxStatus !== "vat_registered" &&',
  '      data.taxStatus !== "non_vat" &&',
  '      data.taxStatus !== "unknown"',
  "    ) ||",
  "    data.vatRateBps !== (",
  '      data.taxStatus === "vat_registered" ? 1200 : 0',
  "    )",
  "  ) {",
  '    throw new Error("Invalid provider tax preview.");',
  "  }",
  "",
  "  return data;",
  "}",
  "",
].join("\n");

// ============================================================
// 5. CREATE VAT REGRESSION TESTS
// ============================================================

console.log("\n=== 5. PREPARE REGRESSION TESTS ===");

const testText = [
  'import {describe, expect, it} from "vitest";',
  "",
  "import {",
  "  customerProviderVatBreakdown,",
  '} from "@/lib/customer/bookings/customer-provider-vat-breakdown";',
  "",
  'describe("customer booking VAT preview", () => {',
  '  it("extracts VAT from PHP 1850", () => {',
  "    const result = customerProviderVatBreakdown(",
  "      1850,",
  '      "vat_registered",',
  "    );",
  "",
  "    expect(result).toEqual({",
  "      exclusiveCentavos: 165179,",
  "      vatCentavos: 19821,",
  "    });",
  "",
  "    expect(",
  "      result!.exclusiveCentavos + result!.vatCentavos,",
  "    ).toBe(185000);",
  "  });",
  "",
  '  it("does not invent VAT for Non-VAT providers", () => {',
  "    expect(customerProviderVatBreakdown(",
  "      1850,",
  '      "non_vat",',
  "    )).toBeNull();",
  "  });",
  "",
  '  it("does not invent VAT when verification is unknown", () => {',
  "    expect(customerProviderVatBreakdown(",
  "      1850,",
  '      "unknown",',
  "    )).toBeNull();",
  "  });",
  "",
  '  it("handles loading and invalid prices", () => {',
  "    expect(customerProviderVatBreakdown(",
  "      1850,",
  "      null,",
  "    )).toBeNull();",
  "",
  "    for (const price of [null, -1, NaN, Infinity]) {",
  "      expect(customerProviderVatBreakdown(",
  "        price,",
  '        "vat_registered",',
  "      )).toBeNull();",
  "    }",
  "  });",
  "",
  '  it("recalculates when package price changes", () => {',
  "    expect(customerProviderVatBreakdown(",
  "      2240,",
  '      "vat_registered",',
  "    )).toEqual({",
  "      exclusiveCentavos: 200000,",
  "      vatCentavos: 24000,",
  "    });",
  "  });",
  "",
  '  it("uses integer centavo rounding", () => {',
  "    expect(customerProviderVatBreakdown(",
  "      1,",
  '      "vat_registered",',
  "    )).toEqual({",
  "      exclusiveCentavos: 89,",
  "      vatCentavos: 11,",
  "    });",
  "  });",
  "});",
  "",
].join("\n");

// ============================================================
// 6. CREATE BACKUP BEFORE WRITING
// ============================================================

const backupDir = fs.mkdtempSync(
  path.join(os.tmpdir(), "FEASTA-VAT-Web-Stage2-"),
);

fs.writeFileSync(
  path.join(backupDir, "event-customization-experience.tsx"),
  originalBytes,
);

console.log(`\nBackup: ${backupDir}`);

// ============================================================
// 7. APPLY, TEST, AND ROLLBACK ON FAILURE
// ============================================================

let applied = false;

try {
  console.log("\n=== 6. APPLY WEB CHANGES ===");

  applied = true;

  fs.writeFileSync(absolute(reviewFile), updated, "utf8");
  fs.writeFileSync(absolute(clientFile), clientText, "utf8");
  fs.writeFileSync(absolute(mathFile), mathText, "utf8");
  fs.writeFileSync(absolute(testFile), testText, "utf8");

  run(
    "7. WEB TYPESCRIPT",
    "pnpm",
    ["--dir", "apps/web", "exec", "tsc", "--noEmit"],
  );

  run(
    "8. WEB ESLINT",
    "pnpm",
    [
      "--dir",
      "apps/web",
      "exec",
      "eslint",
      "src/components/customer/bookings/event-customization-experience.tsx",
      "src/lib/customer/bookings/customer-provider-vat-preview-client.ts",
      "src/lib/customer/bookings/customer-provider-vat-breakdown.ts",
      "test/components/customer-provider-vat-breakdown.test.ts",
    ],
  );

  run(
    "9. VAT REGRESSION TESTS",
    "pnpm",
    [
      "--dir",
      "apps/web",
      "exec",
      "vitest",
      "run",
      "test/components/customer-provider-vat-breakdown.test.ts",
    ],
  );

  run(
    "10. GIT DIFF CHECK",
    "git",
    [
      "-c",
      "core.safecrlf=false",
      "diff",
      "--check",
      "--",
      reviewFile,
    ],
  );

} catch (error) {
  console.error("\nStage 2 validation failed.");

  if (applied) {
    fs.writeFileSync(absolute(reviewFile), originalBytes);

    for (const file of newFiles) {
      if (fs.existsSync(absolute(file))) {
        fs.unlinkSync(absolute(file));
      }
    }

    console.error("Stage 2 files restored.");
    console.error("Stage 1 backend files preserved.");
  }

  console.error(error.message);
  process.exitCode = 1;
}

if (process.exitCode !== 1) {
  console.log("\n=== FINAL GIT STATUS ===");

  run("GIT STATUS", "git", ["status", "--short"]);

  console.log("\n======================================");
  console.log("PASS: FEASTA WEB VAT PREVIEW");
  console.log("======================================");
  console.log("Web TypeScript: PASSED");
  console.log("Web ESLint: PASSED");
  console.log("VAT tests: PASSED");
  console.log("Stage 1 Firebase source: PRESERVED");
  console.log("No commit, push, emulator, or deployment.");
}
