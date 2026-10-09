import {
  readFileSync,
  readdirSync,
} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

const webRoot = process.cwd();
const sourceRoot = join(webRoot, "src");
const globalStyles = readFileSync(
  join(sourceRoot, "app/globals.css"),
  "utf8",
);

function cssToken(name: string): string {
  const match = globalStyles.match(
    new RegExp(`--${name}:\\s*(#[0-9a-f]{6});`, "iu"),
  );

  if (!match) {
    throw new Error(`Missing CSS token --${name}.`);
  }

  return match[1].toLowerCase();
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap(
    (entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return sourceFiles(path);
      }

      return /\.(?:css|tsx?)$/u.test(entry.name) ? [path] : [];
    },
  );
}

function contrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map(
      (index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255,
    );
    const linear = channels.map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

    return 0.2126 * linear[0] +
      0.7152 * linear[1] +
      0.0722 * linear[2];
  };
  const values = [luminance(first), luminance(second)]
    .sort((left, right) => right - left);

  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("FEASTA brand theme contract", () => {
  it("defines the canonical semantic brand palette", () => {
    expect(cssToken("primary")).toBe("#093b26");
    expect(cssToken("primary-hover")).toBe("#10492e");
    expect(cssToken("primary-pressed")).toBe("#073520");
    expect(cssToken("primary-strong")).toBe("#093b26");
    expect(cssToken("primary-foreground")).toBe("#ffffff");
    expect(cssToken("primary-tint")).toBe("#e8f1ee");
    expect(cssToken("primary-tint-strong")).toBe("#d4e7df");
    expect(cssToken("background")).toBe("#f7f8f8");
    expect(cssToken("foreground")).toBe("#123b30");
    expect(cssToken("secondary")).toBe("#f3f4f4");
    expect(cssToken("muted")).toBe("#edefef");
    expect(cssToken("accent")).toBe("#e8f1ee");
    expect(cssToken("border")).toBe("#d9dedc");
    expect(cssToken("ring")).toBe("#087159");
    expect(cssToken("link")).toBe("#0b6953");
    expect(cssToken("feasta-sidebar")).toBe("#ffffff");
    expect(cssToken("feasta-sidebar-foreground")).toBe("#123b30");
    expect(cssToken("feasta-sidebar-muted")).toBe("#667a74");
    expect(cssToken("feasta-sidebar-active")).toBe("#e8f1ee");
    expect(cssToken("feasta-sidebar-indicator")).toBe("#0b6953");

    expect(globalStyles).toContain(
      "--color-primary-tint: var(--primary-tint)",
    );
    expect(globalStyles).toContain(
      "--color-primary-tint-strong: var(--primary-tint-strong)",
    );
  });

  it("keeps primary controls, accents, and focus rings accessible", () => {
    const white = cssToken("primary-foreground");
    const primary = cssToken("primary");

    expect(contrastRatio(white, primary)).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(white, cssToken("primary-hover")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(white, cssToken("primary-pressed")),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(primary, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(cssToken("ring"), "#ffffff"),
    ).toBeGreaterThanOrEqual(3);
  });

  it("removes competing legacy brand literals and Customer overrides", () => {
    const source = sourceFiles(sourceRoot)
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .toLowerCase();
    const customerSource = [
      ...sourceFiles(join(sourceRoot, "app/customer")),
      ...sourceFiles(join(sourceRoot, "components/customer")),
    ].map((path) => readFileSync(path, "utf8")).join("\n").toLowerCase();

    for (const legacyBrandLiteral of [
      "#ff6333",
      "#ff6500",
      "#e95700",
      "#fff0e7",
      "#ffe3d2",
      "rgb(255 99 51",
      "rgb(255_99_51",
      "rgba(255,99,51",
    ]) {
      expect(source).not.toContain(legacyBrandLiteral);
    }

    for (const centralizedBrandLiteral of [
      "#093b26",
      "#10492e",
      "#073520",
      "#0b6953",
      "#087159",
      "#e8f1ee",
      "#d4e7df",
    ]) {
      expect(customerSource).not.toContain(centralizedBrandLiteral);
    }

    for (const removedBrandLiteral of [
      "#d4af37",
      "#daa520",
      "#b48916",
      "#a67c11",
      "#9a7717",
      "#8e6b0a",
      "#eadcae",
      "#e7d59a",
      "#e8c95d",
      "#fff6cd",
      "#ae8959",
      "#be9c67",
      "#c1a767",
      "#e8d097",
      "#be9b66",
      "#a98455",
      "#550b14",
      "#450910",
      "#36070c",
      "#f7f0f2",
      "#eddde0",
      "#fffdfb",
      "#fff8f3",
      "#fff6f0",
      "#2b211d",
      "#241d1a",
    ]) {
      expect(source).not.toContain(removedBrandLiteral);
    }
  });

  it("preserves semantic status and Google identity colors", () => {
    expect(cssToken("destructive")).toBe("#b42318");
    expect(cssToken("success")).toBe("#166534");
    expect(cssToken("warning")).toBe("#92400e");
    expect(cssToken("info")).toBe("#1d4ed8");

    const loginForm = readFileSync(
      join(sourceRoot, "app/login/login-form.tsx"),
      "utf8",
    ).toLowerCase();

    for (const googleColor of [
      "#4285f4",
      "#34a853",
      "#fbbc05",
      "#ea4335",
    ]) {
      expect(loginForm).toContain(googleColor);
    }
  });

  it("keeps shared buttons and navigation on semantic tokens", () => {
    const button = readFileSync(
      join(sourceRoot, "components/ui/button.tsx"),
      "utf8",
    );
    const navigation = [
      "components/layout/application-sidebar.tsx",
      "components/layout/mobile-navigation.tsx",
    ].map((path) => readFileSync(join(sourceRoot, path), "utf8")).join("\n");

    expect(button).toContain(
      "bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed",
    );
    expect(navigation).toContain("bg-feasta-sidebar");
    expect(navigation).toContain("bg-feasta-sidebar-active");
    expect(navigation).toContain("bg-feasta-sidebar-indicator");
    expect(navigation).toContain("bg-primary-tint");
    expect(navigation).toContain("text-primary-strong");
  });

  it("loads Plus Jakarta Sans for interface text and Playfair Display for accents", () => {
    const layout = readFileSync(
      join(sourceRoot, "app/layout.tsx"),
      "utf8",
    );

    expect(layout).toContain("Plus_Jakarta_Sans");
    expect(layout).toContain("Playfair_Display");
    expect(layout).toContain("--font-plus-jakarta");
    expect(layout).toContain("--font-playfair");
    expect(globalStyles).toContain("var(--font-plus-jakarta)");
    expect(globalStyles).toContain("var(--font-playfair)");
    expect(globalStyles).toContain(".feasta-quote");
  });
});
