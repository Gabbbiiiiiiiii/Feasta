"use client";

import {Sparkles, X} from "lucide-react";
import {useState, useSyncExternalStore} from "react";

const DISMISSAL_KEY = "feasta:marketplace-introduction-dismissed";
const DISMISSAL_EVENT = "feasta:marketplace-introduction-change";

function createDismissalStore() {
  let savedDismissal = false;
  return {
    getSnapshot: () => savedDismissal,
    subscribe(onChange: () => void) {
      // React subscribes after commit; rendering only reads the cached boolean.
      const refresh = () => {
        savedDismissal = sessionDismissed();
        onChange();
      };
      window.addEventListener(DISMISSAL_EVENT, refresh);
      refresh();
      return () => window.removeEventListener(DISMISSAL_EVENT, refresh);
    },
  };
}

function sessionDismissed() {
  try {
    return window.sessionStorage.getItem(DISMISSAL_KEY) === "true";
  } catch {
    return false;
  }
}

// Both SSR and the first hydration render show the same banner.
const serverSnapshot = () => false;

export function MarketplaceWelcomeBanner() {
  const [store] = useState(createDismissalStore);
  const savedDismissal = useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
  const [dismissed, setDismissed] = useState(false);

  function dismiss() {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISSAL_KEY, "true");
      window.dispatchEvent(new Event(DISMISSAL_EVENT));
    } catch {
      // In-page dismissal still works if browser storage is unavailable.
    }
    document.getElementById("provider-results-title")?.focus();
  }

  if (dismissed || savedDismissal) return null;

  return (
    <section aria-label="Marketplace introduction" className="relative overflow-hidden rounded-[28px] border border-feasta-border-soft bg-card px-5 py-5 shadow-card sm:px-7">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-primary/[0.055] blur-3xl" />
      <button type="button" onClick={dismiss} aria-label="Dismiss marketplace introduction" className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-xl text-feasta-text-secondary transition-colors duration-200 hover:bg-feasta-surface-soft hover:text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none">
        <X aria-hidden="true" className="size-4" />
      </button>
      <div className="relative pr-9">
        <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.13em] text-primary-strong">
          <Sparkles aria-hidden="true" className="size-4" />
          FEASTA Marketplace
        </p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-foreground sm:text-3xl">
          Find services that fit <span className="text-primary">your celebration.</span>
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-feasta-text-secondary">
          Browse approved public providers, compare services, and continue planning your event with FEASTA.
        </p>
      </div>
    </section>
  );
}
