import {readdirSync, readFileSync} from "node:fs";
import {join, relative} from "node:path";

import {describe, expect, it} from "vitest";

function actionFiles(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return actionFiles(path);
    return entry.isFile() && entry.name === "actions.ts" ? [path] : [];
  });
}

describe("provider Server Action modules", () => {
  const root = process.cwd();
  const providerRoot = join(root, "src/app/provider");
  const serverActionModules = actionFiles(providerRoot).filter((path) =>
    /^"use server";/u.test(readFileSync(path, "utf8")),
  );

  it("keeps every exported action function explicitly async", () => {
    expect(serverActionModules.map((path) => relative(providerRoot, path)))
      .toEqual(expect.arrayContaining([
        join("bookings", "actions.ts"),
        join("payments", "actions.ts"),
        join("reviews", "actions.ts"),
      ]));

    for (const path of serverActionModules) {
      const source = readFileSync(path, "utf8");
      const exportedFunctions = [...source.matchAll(
        /\bexport\s+(async\s+)?function\s+([A-Za-z_$][\w$]*)/gu,
      )];

      expect(exportedFunctions.length, relative(root, path)).toBeGreaterThan(0);
      for (const declaration of exportedFunctions) {
        expect(declaration[1], `${relative(root, path)}:${declaration[2]}`)
          .toBe("async ");
      }
      const exportedConstants = [...source.matchAll(
        /\bexport\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/gu,
      )];
      for (const declaration of exportedConstants) {
        expect(declaration[2]?.trim(), `${relative(root, path)}:${declaration[1]}`)
          .toMatch(/^async\b/u);
      }
      expect(source, relative(root, path)).not.toMatch(
        /\bexport\s+function\s+/u,
      );
      expect(source, relative(root, path)).not.toMatch(
        /\bexport\s+(?:let|var|class)\s+|\bexport\s*\{/u,
      );
    }
  });
});
