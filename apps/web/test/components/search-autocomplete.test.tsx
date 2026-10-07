import {act, fireEvent, render, screen} from "@testing-library/react";
import {useState} from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {SearchInput, type SuggestionLoader} from "@/components/forms/search-input";
import {matchingSuggestions} from "@/components/forms/search-suggestions";
import {FilterToolbar} from "@/components/data/filter-toolbar";
const item = {key: "safe-key", label: "Ana Catering", context: "Approved · Catering", value: "Ana Catering"};
const selected = vi.fn();
function Harness({load, scope = "all"}: {load: SuggestionLoader; scope?: string}) {
  const [value, setValue] = useState("");
  return <SearchInput aria-label="Find" value={value} onChange={e => setValue(e.target.value)} loadSuggestions={load} suggestionScope={scope} onSuggestionSelect={s => {selected(s); setValue(s.value);}} />;
}
beforeEach(() => {vi.useFakeTimers(); selected.mockReset();});
afterEach(() => vi.useRealTimers());
const type = (value: string) => {const input = screen.getByRole("combobox"); fireEvent.focus(input); fireEvent.change(input, {target: {value}}); return input;};
const tick = async () => act(async () => {await vi.advanceTimersByTimeAsync(275);});
it("debounces, requires two characters and bounds suggestions", async () => {
  const load = vi.fn().mockResolvedValue(Array.from({length: 10}, (_, i) => ({...item, key: String(i)})));
  render(<Harness load={load} />); type("a"); await tick(); expect(load).not.toHaveBeenCalled();
  type("an"); await act(async () => {await vi.advanceTimersByTimeAsync(274);}); expect(load).not.toHaveBeenCalled();
  await act(async () => {await vi.advanceTimersByTimeAsync(1);}); expect(load).toHaveBeenCalledExactlyOnceWith("an");
  expect(screen.getAllByRole("option")).toHaveLength(6);
});
it("supports arrows, Enter selection without duplicate submit and Escape", async () => {
  render(<Harness load={async () => [item, {...item, key: "b", label: "Bea", value: "Bea"}]} />);
  const input = type("an"); await tick(); fireEvent.keyDown(input, {key: "ArrowDown"});
  expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0].id);
  fireEvent.keyDown(input, {key: "ArrowUp"}); fireEvent.keyDown(input, {key: "Enter"});
  expect(selected).toHaveBeenCalledOnce(); expect(input).toHaveValue("Bea"); expect(screen.queryByRole("listbox")).toBeNull();
  type("an"); await tick(); fireEvent.keyDown(input, {key: "Escape"}); expect(screen.queryByRole("listbox")).toBeNull();
});
it("selects by mouse and closes on outside pointer or blur", async () => {
  render(<Harness load={async () => [item]} />); type("an"); await tick(); fireEvent.click(screen.getByRole("option")); expect(selected).toHaveBeenCalledWith(item);
  const input = type("an"); await tick(); fireEvent.pointerDown(document.body); expect(screen.queryByRole("listbox")).toBeNull();
  fireEvent.focus(input); await tick(); fireEvent.blur(input); expect(screen.queryByRole("listbox")).toBeNull();
});
it("ignores stale results, including responses after unmount", async () => {
  let resolveOld!: (items: typeof item[]) => void;
  const load = vi.fn().mockImplementationOnce(() => new Promise(resolve => {resolveOld = resolve;})).mockResolvedValueOnce([{...item, label: "Newest"}]);
  const view = render(<Harness load={load} />); type("old"); await tick(); type("new"); await tick();
  await act(async () => {resolveOld([{...item, label: "Stale"}]);}); expect(screen.getByText("Newest")).toBeInTheDocument(); expect(screen.queryByText("Stale")).toBeNull();
  view.unmount();
});
it("shows no results and safe failures without clearing typed input", async () => {
  const load = vi.fn().mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("secret processor id"));
  render(<Harness load={load} />); type("none"); await tick(); expect(screen.getByText("No matching results")).toBeInTheDocument();
  const input = type("fail"); await tick(); expect(screen.getByText("Suggestions unavailable. You can still search.")).toBeInTheDocument(); expect(input).toHaveValue("fail"); expect(screen.queryByText(/secret processor/)).toBeNull();
});
it("does not poll on unrelated rerenders and reloads when active filter scope changes", async () => {
  const load = vi.fn().mockResolvedValue([item]); const view = render(<Harness load={load} />); type("an"); await tick();
  view.rerender(<Harness load={async q => load(q)} />); await tick(); expect(load).toHaveBeenCalledTimes(1);
  view.rerender(<Harness load={load} scope="paid" />); await tick(); expect(load).toHaveBeenCalledTimes(2); expect(screen.getByRole("combobox")).toHaveValue("an");
});
it("preserves manual submit and selects exactly once in the toolbar", async () => {
  const submit = vi.fn();
  function Toolbar() {const [value, setValue] = useState(""); return <FilterToolbar searchValue={value} onSearchChange={setValue} onSearchSubmit={submit} onClearFilters={() => {}} loadSuggestions={async () => [item]} activeFilters={["Status: active"]} />;}
  render(<Toolbar />); const input = type("an"); await tick(); fireEvent.keyDown(input, {key: "ArrowDown"}); fireEvent.keyDown(input, {key: "Enter"}); expect(submit).toHaveBeenCalledExactlyOnceWith(item.value);
  fireEvent.click(screen.getByRole("button", {name: "Search"})); expect(submit).toHaveBeenCalledTimes(2); expect(screen.getByText("Active filters: Status: active")).toBeInTheDocument();
});


it("ignores a pending request after unmount and cancels an unstarted debounce", async () => {
  let resolve!: (items: typeof item[]) => void;
  const load = vi.fn(() => new Promise<typeof item[]>(done => {resolve = done;}));
  const view = render(<Harness load={load} />); type("an"); await tick(); view.unmount();
  await act(async () => {resolve([item]);}); expect(screen.queryByRole("option")).toBeNull();
  const next = render(<Harness load={load} />); type("an"); next.unmount(); await tick(); expect(load).toHaveBeenCalledTimes(1);
});


it("matches existing authorized description fields without putting them in preview projections", () => {
  expect(matchingSuggestions("family", [{...item, searchText: "Family celebrations"}])).toEqual([item]);
  expect(matchingSuggestions("unmatched", [{...item, searchText: "Family celebrations"}])).toEqual([]);
});
