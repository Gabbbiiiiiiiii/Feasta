import {act, render, screen} from "@testing-library/react";
import {Profiler} from "react";
import userEvent from "@testing-library/user-event";
import {renderToString} from "react-dom/server";
import {hydrateRoot} from "react-dom/client";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {ProviderDirectoryShell} from "@/components/customer/providers/provider-directory-shell";
import {MarketplaceWelcomeBanner} from "@/components/customer/providers/marketplace-welcome-banner";

describe("marketplace welcome banner", () => {
  it("reads saved dismissal only after the first client commit", () => {
    window.sessionStorage.setItem("feasta:marketplace-introduction-dismissed", "true");
    const reads = vi.spyOn(Storage.prototype, "getItem");
    const commitReadCounts: number[] = [];
    const view = render(<Profiler id="banner" onRender={() => commitReadCounts.push(reads.mock.calls.length)}><MarketplaceWelcomeBanner /></Profiler>);
    expect(commitReadCounts[0]).toBe(0);
    expect(reads).toHaveBeenCalled();
    expect(view.container).toBeEmptyDOMElement();
  });
  beforeEach(() => window.sessionStorage.clear());

  it("dismisses with the keyboard, removes the banner, and returns focus to results", async () => {
    const user = userEvent.setup();
    render(<ProviderDirectoryShell>
      <h1 id="provider-results-title" tabIndex={-1}>Marketplace providers</h1>
    </ProviderDirectoryShell>);
    expect(screen.getByRole("region", {name: "Marketplace introduction"})).toBeVisible();
    const dismiss = screen.getByRole("button", {name: "Dismiss marketplace introduction"});
    expect(dismiss).toHaveClass("focus-visible:ring-2");
    dismiss.focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("region", {name: "Marketplace introduction"})).not.toBeInTheDocument();
    expect(screen.getByRole("heading", {name: "Marketplace providers"})).toHaveFocus();
  });

  it("remembers dismissal when the banner remounts in the same session", async () => {
    const user = userEvent.setup();
    const view = render(<MarketplaceWelcomeBanner />);
    await user.click(screen.getByRole("button", {name: "Dismiss marketplace introduction"}));
    view.unmount();
    const restored = render(<MarketplaceWelcomeBanner />);
    expect(restored.container).toBeEmptyDOMElement();
    restored.unmount();
    window.sessionStorage.clear();
    render(<MarketplaceWelcomeBanner />);
    expect(screen.getByRole("region", {name: "Marketplace introduction"})).toBeVisible();
  });

  it("still dismisses in-page when session storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
    const user = userEvent.setup();
    const view = render(<MarketplaceWelcomeBanner />);
    await user.click(screen.getByRole("button", {name: "Dismiss marketplace introduction"}));
    expect(view.container).toBeEmptyDOMElement();
  });

  it.each([false, true])("hydrates deterministic markup with saved dismissal %s and no attribute warnings", async (dismissed) => {
    if (dismissed) window.sessionStorage.setItem("feasta:marketplace-introduction-dismissed", "true");
    const readStorage = vi.spyOn(Storage.prototype, "getItem");
    const markup = renderToString(<MarketplaceWelcomeBanner />);
    expect(markup).toContain("Dismiss marketplace introduction");
    expect(renderToString(<MarketplaceWelcomeBanner />)).toBe(markup);
    expect(readStorage).not.toHaveBeenCalled();
    const container = document.createElement("div");
    container.innerHTML = markup;
    const onRecoverableError = vi.fn();
    const errors = vi.spyOn(console, "error");
    const warnings = vi.spyOn(console, "warn");
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => { root = hydrateRoot(container, <MarketplaceWelcomeBanner />, {onRecoverableError}); });
      if (dismissed) expect(container).toBeEmptyDOMElement();
      else expect(container.innerHTML).toBe(markup);
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
      expect(warnings).not.toHaveBeenCalled();
    } finally {
      await act(async () => root?.unmount());
      errors.mockRestore();
      warnings.mockRestore();
    }
  });
});
