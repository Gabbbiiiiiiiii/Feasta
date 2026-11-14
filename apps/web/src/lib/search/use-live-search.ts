"use client";

import {useEffect, useRef} from "react";

const LIVE_SEARCH_DELAY_MS = 275;

/**
 * Debounces a live record search.
 * One non-whitespace character starts the timer. An empty query, Clear,
 * Search, and Enter run immediately and cancel any pending timer.
 */
export function useLiveSearch(
  value: string,
  execute: (query: string) => void,
  invalidate?: () => void,
) {
  const callbacks = useRef({execute, invalidate});
  const latestValue = useRef(value);
  const applied = useRef<string | null>(value.trim());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    latestValue.current = value;
    callbacks.current = {execute, invalidate};
  });

  const cancelTimer = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
  };

  const run = (query: string) => {
    if (!mounted.current) return;
    cancelTimer();
    const normalized = query.trim();
    applied.current = normalized;
    callbacks.current.execute(normalized);
  };

  const submit = (query?: string) => {
    run(query ?? latestValue.current);
  };

  /** Drops a pending debounce without starting another search. */
  const acknowledge = (query?: string) => {
    cancelTimer();
    applied.current = (query ?? latestValue.current).trim();
  };

  /**
   * Marks the field cleared and invalidates in-flight work.
   * The caller performs the immediate unfiltered read.
   */
  const beginClear = () => {
    cancelTimer();
    applied.current = "";
    callbacks.current.invalidate?.();
  };

  useEffect(() => {
    const query = value.trim();
    if (query === applied.current) return;

    if (!query) {
      applied.current = query;
      if (mounted.current) callbacks.current.execute(query);
      return;
    }

    timer.current = setTimeout(() => {
      timer.current = undefined;
      if (!mounted.current) return;
      applied.current = query;
      callbacks.current.execute(query);
    }, LIVE_SEARCH_DELAY_MS);

    return () => {
      clearTimeout(timer.current);
    };
  }, [value]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      timer.current = undefined;
    };
  }, []);

  return {
    submit,
    acknowledge,
    beginClear,
    change: (next: string) => {
      cancelTimer();
      callbacks.current.invalidate?.();
      if (!next.trim()) {
        applied.current = "";
        if (mounted.current) callbacks.current.execute("");
        return;
      }
      applied.current = null;
    },
  };
}
