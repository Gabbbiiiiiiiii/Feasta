import {useRef, useState} from "react";
import {act, cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {FilterToolbar} from "@/components/data/filter-toolbar";

let load = vi.fn<(input: {search: string; status: string; cursor: null}) => Promise<string[]>>();
function Harness() {
  const [value, setValue] = useState("");
  const [rows, setRows] = useState(["bagong business", "other provider"]);
  const [error, setError] = useState("");
  const generation = useRef(0);
  return <><FilterToolbar searchValue={value} onSearchChange={setValue}
    onSearchInvalidate={() => { generation.current += 1; }}
    onSearchSubmit={query => {
      const version = ++generation.current;
      void load({search: query, status: "active", cursor: null}).then((result: string[]) => {
        if (version === generation.current) setRows(result);
      }).catch(() => { if (version === generation.current) setError("Search failed"); });
    }} onClearFilters={() => {}} activeFilters={["Status: active"]} />
    <ul aria-label="Actual providers">{rows.map(row => <li key={row}>{row}</li>)}</ul>
    {error ? <p role="alert">{error}</p> : null}</>;
}
beforeEach(() => { vi.useFakeTimers(); load = vi.fn(async ({search}: {search: string}) => ["bagong business", "other provider"].filter(row => row.includes(search))); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
async function tick(ms = 275) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
it("one character updates the real list after debounce without a popup or button", async () => {
  render(<Harness />); fireEvent.change(screen.getByRole("searchbox"), {target: {value: "b"}});
  await tick(274); expect(load).not.toHaveBeenCalled(); await tick(1);
  expect(load).toHaveBeenLastCalledWith({search: "b", status: "active", cursor: null});
  expect(screen.getByText("bagong business")).toBeInTheDocument(); expect(screen.queryByText("other provider")).toBeNull();
  expect(screen.queryByRole("listbox")).toBeNull(); expect(screen.queryByText(/Loading suggestions|No matching results/)).toBeNull();
});
it("debounces successive partial queries and preserves filters and text", async () => {
  render(<Harness />); const input = screen.getByRole("searchbox");
  fireEvent.change(input, {target: {value: "b"}}); await tick(200);
  fireEvent.change(input, {target: {value: "bag"}}); await tick(274); expect(load).not.toHaveBeenCalled(); await tick(1);
  expect(load).toHaveBeenCalledTimes(1); expect(load).toHaveBeenLastCalledWith({search: "bag", status: "active", cursor: null}); expect(input).toHaveValue("bag");
});
it("Search performs an immediate query and cancels the scheduled duplicate", async () => {
  render(<Harness />); fireEvent.change(screen.getByRole("searchbox"), {target: {value: "bag"}});
  await act(async () => { fireEvent.click(screen.getByRole("button", {name: "Search"})); });
  expect(load).toHaveBeenCalledTimes(1); await tick(); expect(load).toHaveBeenCalledTimes(1);
});
it("form submission used by Enter executes immediately", async () => {
  render(<Harness />); fireEvent.change(screen.getByRole("searchbox"), {target: {value: "bag"}});
  await act(async () => { fireEvent.submit(screen.getByRole("search")); }); expect(load).toHaveBeenCalledTimes(1);
});
it("X restores unfiltered rows immediately while preserving status", async () => {
  render(<Harness />); fireEvent.change(screen.getByRole("searchbox"), {target: {value: "bag"}}); await tick();
  await act(async () => {fireEvent.click(screen.getByRole("button", {name: "Clear search"}));});
  expect(load).toHaveBeenLastCalledWith({search: "", status: "active", cursor: null}); expect(screen.getByText("other provider")).toBeInTheDocument();
});
it("whitespace restores results without waiting", async () => {
  render(<Harness />); fireEvent.change(screen.getByRole("searchbox"), {target: {value: "bag"}}); await tick();
  await act(async () => {fireEvent.change(screen.getByRole("searchbox"), {target: {value: " "}});});
  expect(load).toHaveBeenLastCalledWith({search: "", status: "active", cursor: null});
});
it("invalidates old results as soon as newer text is typed, before its debounce", async () => {
  let resolveOld!: (rows: string[]) => void; load.mockImplementationOnce(() => new Promise<string[]>(resolve => {resolveOld = resolve;}));
  render(<Harness />); const input = screen.getByRole("searchbox");
  fireEvent.change(input, {target: {value: "b"}}); await tick();
  fireEvent.change(input, {target: {value: "bag"}});
  await act(async () => {resolveOld(["obsolete response"]);}); expect(screen.queryByText("obsolete response")).toBeNull();
  await tick(); expect(screen.getByText("bagong business")).toBeInTheDocument();
});
it("cancels a pending search when the field unmounts", async () => {
  const view = render(<Harness />);
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "bag"}});
  view.unmount();
  await tick();
  expect(load).not.toHaveBeenCalled();
});
it("keeps typed text usable while pending and after errors", async () => {
  load.mockRejectedValueOnce(new Error("offline")); render(<Harness />);
  const input = screen.getByRole("searchbox"); fireEvent.change(input, {target: {value: "bag"}}); await tick();
  expect(input).toHaveValue("bag"); expect(input).not.toBeDisabled(); expect(screen.getByRole("alert")).toHaveTextContent("Search failed");
});
