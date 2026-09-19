import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {useState} from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {customizationDraftKey, parseCustomizationDraft, readCustomizationDraft, saveCustomizationDraft, type CustomizationDraft} from "@/lib/customer/bookings/customization-draft";
import {useCustomizationDraft} from "@/lib/customer/bookings/use-customization-draft";
import {isPublicMarketplacePath} from "@/lib/customer/providers/provider-route-policy";

const initial: CustomizationDraft = {event: {eventDate: "", eventTime: "", eventEndTime: "", guestCount: "", eventLocation: "", eventAddress: "", specialRequest: ""}, customization: {selectedFoods: [], selectedDecorations: [], selectedFurniture: []}, addonIds: []};
function Harness({owner = "guest", packageId = "package"}) {
  const [value, setValue] = useState(initial);
  const [requestId, setRequestId] = useState("");
  const saved = useCustomizationDraft({owner, providerId: "provider", packageId, context: "", value, restore: setValue});
  return <><input aria-label="Notes" value={value.event.specialRequest} onChange={(event) => setValue({...value, event: {...value.event, specialRequest: event.target.value}})} />
    <p>{saved.status}</p><button onClick={saved.clear}>Submitted successfully</button>
    <button onClick={async () => setRequestId(await saved.submissionId(JSON.stringify(value.event), () => `booking-${crypto.randomUUID()}`))}>Prepare submission</button><output>{requestId}</output>
    {saved.choices.map((choice) => <button key={choice.key} onClick={() => saved.resume(choice)}>Continue {choice.value.event.eventDate}</button>)}</>;
}
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const tick = (ms = 0) => act(() => { vi.advanceTimersByTime(ms); });

it("debounces rapid edits, flushes navigation, restores, and adopts a guest draft once", () => {
  const write = vi.spyOn(Storage.prototype, "setItem");
  const first = render(<Harness />); tick();
  fireEvent.change(screen.getByLabelText("Notes"), {target: {value: "A"}});
  fireEvent.change(screen.getByLabelText("Notes"), {target: {value: "AB"}});
  expect(write).not.toHaveBeenCalled(); tick(400);
  expect(write).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Notes"), {target: {value: "Wedding notes"}});
  first.unmount();
  const second = render(<Harness owner="customer" />); tick();
  expect(screen.getByLabelText("Notes")).toHaveValue("Wedding notes");
  expect(readCustomizationDraft(localStorage, customizationDraftKey("guest", "provider", "package"))).toBeNull();
  second.unmount();
  render(<Harness owner="customer" />); tick();
  expect(screen.getByLabelText("Notes")).toHaveValue("Wedding notes");
  expect(localStorage.length).toBe(1);
});

it("does not overwrite other packages and clears only after success without a delayed resave", () => {
  const other = customizationDraftKey("guest", "provider", "other");
  saveCustomizationDraft(localStorage, other, initial);
  const view = render(<Harness />); tick();
  fireEvent.change(screen.getByLabelText("Notes"), {target: {value: "Keep on submission failure"}}); tick(400);
  expect(localStorage.length).toBe(2);
  fireEvent.click(screen.getByText("Submitted successfully")); tick(500); view.unmount();
  expect(localStorage.length).toBe(1);
  expect(readCustomizationDraft(localStorage, other)).not.toBeNull();
});

it("storage failure preserves editable UI", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota"); });
  render(<Harness />); tick();
  fireEvent.change(screen.getByLabelText("Notes"), {target: {value: "Still here"}}); tick(400);
  expect(screen.getByLabelText("Notes")).toHaveValue("Still here");
  expect(screen.getByText(/Unable to save a draft on this device/)).toBeVisible();
});

it("bounds records, rejects malformed drafts, and strips trusted authority", () => {
  expect(parseCustomizationDraft({...initial, price: 1, refundPolicySnapshot: {terms: "fake"}})).not.toHaveProperty("price");
  expect(parseCustomizationDraft({...initial, addonIds: Array(21).fill("a")})).toBeNull();
  for (let i = 0; i < 25; i++) saveCustomizationDraft(localStorage, customizationDraftKey("guest", "provider", String(i)), initial);
  expect(localStorage.length).toBe(20);
  tick(31 * 86400000);
  expect(readCustomizationDraft(localStorage, customizationDraftKey("guest", "provider", "24"))).toBeNull();
});

it("makes only the bounded public planning route accessible without opening submission routes", () => {
  expect(isPublicMarketplacePath("/customer/packages/package_123/plan")).toBe(true);
  expect(isPublicMarketplacePath("/customer/packages/package_123/book")).toBe(false);
  expect(isPublicMarketplacePath("/customer/packages/package_123/plan/submit")).toBe(false);
  expect(isPublicMarketplacePath("/customer/packages/../plan")).toBe(false);
});

it("offers another saved planning context when returning without its query", () => {
  saveCustomizationDraft(localStorage, customizationDraftKey("guest", "provider", "package", "dated-context"), {
    ...initial, event: {...initial.event, eventDate: "2026-09-20", specialRequest: "Original event"},
  });
  render(<Harness />); tick();
  fireEvent.click(screen.getByText("Continue 2026-09-20"));
  expect(screen.getByLabelText("Notes")).toHaveValue("Original event"); tick(400);
  expect(localStorage.length).toBe(1);
});

it("reuses the persisted submission identity after refresh", async () => {
  vi.useRealTimers();
  const first = render(<Harness owner="customer" />);
  await screen.findByText("Changes save automatically");
  await act(async () => { fireEvent.click(screen.getByText("Prepare submission")); });
  await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/^booking-/));
  const requestId = screen.getByRole("status").textContent;
  expect(requestId).toMatch(/^booking-/);
  first.unmount();
  render(<Harness owner="customer" />);
  await screen.findByText(/Draft restored/);
  await act(async () => { fireEvent.click(screen.getByText("Prepare submission")); });
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(requestId!));
});

it("isolates customer A after guest adoption from logout and customer B", () => {
  const guest = render(<Harness />); tick();
  fireEvent.change(screen.getByLabelText("Notes"), {target: {value: "Guest plan"}}); guest.unmount();
  const a = render(<Harness owner="customer:A" />); tick();
  expect(screen.getByLabelText("Notes")).toHaveValue("Guest plan");
  fireEvent.change(screen.getByLabelText("Notes"), {target: {value: "A private notes"}}); tick(400); a.unmount();
  const signedOut = render(<Harness />); tick();
  expect(screen.getByLabelText("Notes")).toHaveValue("");
  expect(screen.queryByRole("button", {name: /^Continue/})).not.toBeInTheDocument(); signedOut.unmount();
  render(<Harness owner="customer:B" />); tick();
  expect(screen.getByLabelText("Notes")).toHaveValue("");
  expect(screen.queryByRole("button", {name: /^Continue/})).not.toBeInTheDocument();
  expect(readCustomizationDraft(localStorage, customizationDraftKey("customer:A", "provider", "package"))?.event.specialRequest).toBe("A private notes");
});

it("preserves only the authenticated customer's older local namespace", () => {
  saveCustomizationDraft(localStorage, customizationDraftKey("A", "provider", "package"), {
    ...initial, event: {...initial.event, specialRequest: "A's previous local plan"},
  });
  const b = render(<Harness owner="customer:B" />); tick();
  expect(screen.getByLabelText("Notes")).toHaveValue(""); b.unmount();
  render(<Harness owner="customer:A" />); tick();
  expect(screen.getByLabelText("Notes")).toHaveValue("A's previous local plan");
  expect(localStorage.getItem(customizationDraftKey("A", "provider", "package"))).toBeNull();
  expect(localStorage.length).toBe(1);
});

it("never offers an older guest alternative over a matching owned context", () => {
  for (const [owner, note] of [["guest", "Old guest"], ["customer:A", "New owned"]]) {
    saveCustomizationDraft(localStorage, customizationDraftKey(owner, "provider", "package", "context"), {
      ...initial, event: {...initial.event, eventDate: "2026-09-20", specialRequest: note},
    });
  }
  render(<Harness owner="customer:A" />); tick();
  expect(screen.getAllByRole("button", {name: /^Continue/})).toHaveLength(1);
  fireEvent.click(screen.getByText("Continue 2026-09-20"));
  expect(screen.getByLabelText("Notes")).toHaveValue("New owned");
});

it("encodes every identity segment and retains the draft currently being saved during cleanup", () => {
  const keys = [
    ["guest", "p", "pkg", "ctx"], ["customer:guest", "p", "pkg", "ctx"],
    ["customer:A", "p", "pkg", "ctx"], ["customer:B", "p", "pkg", "ctx"],
    ["guest", "p:pkg", "x", "ctx"], ["guest", "p", "pkg:x", "ctx"],
    ["guest", "p", "pkg", "ctx:other"],
  ].map(([owner, provider, pkg, context]) => customizationDraftKey(owner, provider, pkg, context));
  expect(new Set(keys).size).toBe(keys.length);
  const active = keys[0];
  saveCustomizationDraft(localStorage, active, initial);
  for (let i = 0; i < 20; i++) saveCustomizationDraft(localStorage, customizationDraftKey("guest", "p", String(i)), initial);
  saveCustomizationDraft(localStorage, active, initial);
  expect(localStorage.length).toBe(20);
  expect(readCustomizationDraft(localStorage, active)).not.toBeNull();
  localStorage.setItem(active, JSON.stringify({version: 99, savedAt: Date.now(), value: initial}));
  expect(readCustomizationDraft(localStorage, active)).toBeNull();
});

it("flushes the final edit on pagehide before debounce without a network call", () => {
  const network = vi.fn(); vi.stubGlobal("fetch", network);
  const view = render(<Harness />); tick();
  fireEvent.change(screen.getByLabelText("Notes"), {target: {value: "Final edit"}});
  fireEvent(window, new Event("pagehide"));
  expect(readCustomizationDraft(localStorage, customizationDraftKey("guest", "provider", "package"))?.event.specialRequest).toBe("Final edit");
  expect(network).not.toHaveBeenCalled(); view.unmount();
  vi.unstubAllGlobals();
});
