import {act} from "@testing-library/react";
import type {ReactElement} from "react";
import {hydrateRoot} from "react-dom/client";
import {renderToString} from "react-dom/server";
import {expect, vi} from "vitest";

/** Parse real SSR HTML before hydrating, so browser nesting repairs also surface. */
export async function assertHydration(
  tree: ReactElement,
  beforeHydration: (container: HTMLDivElement) => void = () => {},
  afterHydration: (container: HTMLDivElement) => void = () => {},
) {
  const errors = vi.spyOn(console, "error");
  const warnings = vi.spyOn(console, "warn");
  const recoverable = vi.fn();
  const container = document.createElement("div");
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    container.innerHTML = renderToString(tree);
    expect(container.querySelector("[fdprocessedid]")).toBeNull();
    document.body.append(container);
    beforeHydration(container);
    await act(async () => { root = hydrateRoot(container, tree, {onRecoverableError: recoverable}); });
    afterHydration(container);
    expect(recoverable).not.toHaveBeenCalled();
    expect(errors).not.toHaveBeenCalled();
    expect(warnings).not.toHaveBeenCalled();
  } finally {
    await act(async () => root?.unmount());
    container.remove();
    errors.mockRestore();
    warnings.mockRestore();
  }
}
