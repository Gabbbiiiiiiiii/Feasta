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
    expect(cssToken("primary")).toBe("#b02f00");
    expect(cssToken("primary-hover")).toBe("#9c2a00");
    expect(cssToken("primary-pressed")).toBe("#862400");
    expect(cssToken("primary-strong")).toBe("#862200");
    expect(cssToken("primary-foreground")).toBe("#ffffff");
    expect(cssToken("primary-tint")).toBe("#fff1ed");
    expect(cssToken("primary-tint-strong")).toBe("#fee2db");
    expect(cssToken("ring")).toBe("#b02f00");

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
      "#b02f00",
      "#9c2a00",
      "#862400",
      "#862200",
      "#fff1ed",
      "#fee2db",
    ]) {
      expect(customerSource).not.toContain(centralizedBrandLiteral);
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
    expect(navigation).toContain("bg-primary-tint");
    expect(navigation).toContain("text-primary-strong");
    expect(navigation).toContain("focus-visible:ring-primary/40");
  });
});
