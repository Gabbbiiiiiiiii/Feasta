"use client";

import {Search, X} from "lucide-react";
import * as React from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";

export type SearchSuggestion = {key: string; label: string; context?: string; value: string};
export type SuggestionLoader = (query: string) => Promise<readonly SearchSuggestion[]>;
type SearchInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  onClear?: () => void;
  clearLabel?: string;
  loadSuggestions?: SuggestionLoader;
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  suggestionScope?: string;
};

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({onClear, clearLabel = "Clear search", className, loadSuggestions, onSuggestionSelect, suggestionScope = "", ...props}, ref) => {
    const listId = React.useId();
    const container = React.useRef<HTMLDivElement>(null);
    const input = React.useRef<HTMLInputElement | null>(null);
    const loader = React.useRef(loadSuggestions);
    React.useEffect(() => { loader.current = loadSuggestions; }, [loadSuggestions]);
    const query = String(props.value ?? props.defaultValue ?? "").trim();
    const enabled = Boolean(loadSuggestions);
    const [focused, setFocused] = React.useState(false);
    const [closedQuery, setClosedQuery] = React.useState<string | null>(null);
    const [active, setActive] = React.useState(-1);
    const [result, setResult] = React.useState<{query: string; scope: string; state: "loading" | "ready" | "error"; items: readonly SearchSuggestion[]}>({query: "", scope: "", state: "ready", items: []});
    React.useEffect(() => {
      if (!enabled || !focused || query.length < 2 || closedQuery === query) return;
      let current = true;
      const timer = setTimeout(async () => {
        setActive(-1);
        setResult({query, scope: suggestionScope, state: "loading", items: []});
        try {
          const items = await loader.current!(query);
          if (current) setResult({query, scope: suggestionScope, state: "ready", items: items.slice(0, 6)});
        } catch {
          if (current) setResult({query, scope: suggestionScope, state: "error", items: []});
        }
      }, 275);
      return () => { current = false; clearTimeout(timer); };
    }, [query, enabled, focused, closedQuery, suggestionScope]);
    React.useEffect(() => {
      const outside = (event: PointerEvent) => {
        if (!container.current?.contains(event.target as Node)) setFocused(false);
      };
      document.addEventListener("pointerdown", outside);
      return () => document.removeEventListener("pointerdown", outside);
    }, []);
    const open = enabled && focused && query.length >= 2 && closedQuery !== query;
    const current = result.query === query && result.scope === suggestionScope;
    const items = current ? result.items : [];
    const select = (item: SearchSuggestion) => {
      input.current?.focus();
      setClosedQuery(item.value.trim());
      setFocused(false);
      setActive(-1);
      onSuggestionSelect?.(item);
    };
    return <div ref={container} className="relative min-w-0">
      <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
      <Input {...props} ref={(node) => { input.current = node; if (typeof ref === "function") ref(node); else if (ref) ref.current = node; }}
        type="search" className={cn("pl-12", onClear && "pr-14", className)}
        role={enabled ? "combobox" : props.role} aria-autocomplete={enabled ? "list" : undefined}
        aria-expanded={enabled ? open : undefined} aria-controls={open ? listId : undefined}
        aria-activedescendant={open && items[active] ? listId + "-" + active : undefined}
        autoComplete={enabled ? "off" : props.autoComplete}
        onFocus={(event) => { setFocused(true); setClosedQuery(null); props.onFocus?.(event); }}
        onBlur={(event) => { if (!container.current?.contains(event.relatedTarget as Node)) setFocused(false); props.onBlur?.(event); }}
        onChange={(event) => { setClosedQuery(null); setFocused(true); setActive(-1); props.onChange?.(event); }}
        onKeyDown={(event) => {
          props.onKeyDown?.(event);
          if (event.defaultPrevented) return;
          if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setClosedQuery(query); }
          else if (open && items.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault(); setActive(index => event.key === "ArrowDown" ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1));
          } else if (event.key === "Enter") {
            if (open && items[active]) { event.preventDefault(); select(items[active]); }
            else setClosedQuery(query);
          }
        }} />
      {onClear ? <Button type="button" variant="ghost" size="icon" aria-label={clearLabel} title={clearLabel}
        className="absolute right-1 top-1/2 -translate-y-1/2" onClick={onClear} disabled={props.disabled}><X aria-hidden="true" /></Button> : null}
      {open ? <div className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg">
        <ul id={listId} role="listbox" aria-label="Search suggestions">
          {items.map((item, index) => <li key={item.key} id={listId + "-" + index} role="option" aria-selected={active === index}
            className={cn("cursor-pointer break-words rounded-lg px-3 py-2 text-sm", active === index && "bg-muted")}
            onPointerDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => select(item)}>
            <span className="block font-semibold">{item.label}</span>
            {item.context ? <span className="block text-xs text-muted-foreground">{item.context}</span> : null}
          </li>)}
        </ul>
        <p role="status" className="px-3 py-2 text-xs text-muted-foreground">{!current || result.state === "loading" ? "Loading suggestions…" : result.state === "error" ? "Suggestions unavailable. You can still search." : !items.length ? "No matching results" : "Use arrow keys to choose a result."}</p>
      </div> : null}
    </div>;
  },
);
SearchInput.displayName = "SearchInput";
export {SearchInput, type SearchInputProps};
