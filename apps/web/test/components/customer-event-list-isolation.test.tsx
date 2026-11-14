import {act, fireEvent, render, renderHook, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
const mock = vi.hoisted(() => ({auth: {currentUser: null as {uid: string} | null}, listeners: new Set<() => void>()}));
vi.mock("@/lib/firebase/client", () => ({auth: mock.auth}));
vi.mock("firebase/auth", () => ({onAuthStateChanged: (_: unknown, callback: () => void) => {
  mock.listeners.add(callback); return () => mock.listeners.delete(callback);
}}));
import {CustomerEventListMenu} from "@/components/customer/event-list/customer-event-list-menu";
import {addCustomerEventListItem, readCustomerEventList, useCustomerEventList,
  CUSTOMER_EVENT_LIST_STORAGE_KEY, CUSTOMER_EVENT_LIST_SCHEDULE_STORAGE_KEY,
  writeCustomerEventListSchedule, readCustomerEventListSchedule, clearCustomerEventList,
  openCustomerEventList, type CustomerPackageEventListItem} from "@/lib/customer/event-list/customer-event-list";
const item: CustomerPackageEventListItem = {packageId: "package-a", providerId: "provider-a", packageName: "A private configuration", providerName: "Provider", price: 100, imageUrl: null, packageHref: "/customer/packages/package-a"};
function login(uid: string | null) {
  act(() => {mock.auth.currentUser = uid ? {uid} : null; mock.listeners.forEach(callback => callback());});
}
beforeEach(() => {localStorage.clear(); login(null);});
describe("Event List account isolation", () => {
  it("isolates A/B saves, schedule, logout and subsequent sign-in", () => {
    const {result} = renderHook(useCustomerEventList);
    login("A"); act(() => {result.current.addItem(item); result.current.writeSchedule({eventDate: "2027-01-02", eventTime: "10:00"});});
    expect(result.current.items).toHaveLength(1);
    login(null); expect(result.current.items).toEqual([]);
    login("B"); expect(result.current.items).toEqual([]); expect(readCustomerEventListSchedule()).toBeNull();
    act(() => result.current.removeItem(item.packageId));
    act(() => result.current.addItem({...item, packageId: "package-b", packageName: "B configuration"}));
    login(null); login("A");
    expect(result.current.items.map(row => row.type === "custom_menu" ? row.menuItemName : row.packageName)).toEqual([item.packageName]);
    expect(readCustomerEventListSchedule()?.eventTime).toBe("10:00");
    login("B"); expect(result.current.items.map(row => row.type === "custom_menu" ? row.menuItemName : row.packageName)).toEqual(["B configuration"]);
  });
  it("rejects delayed callbacks even after the original UID signs back in", async () => {
    const {result} = renderHook(useCustomerEventList); login("A");
    act(() => result.current.addItem(item)); const stale = result.current;
    login(null); login("B"); act(() => result.current.addItem({...item, packageId: "package-b"}));
    await act(async () => {await Promise.resolve(); expect(stale.addItem(item)).toBe(false); stale.clearItems(); stale.removeItem("package-b"); stale.writeSchedule({eventDate: "2027-01-02", eventTime: "12:00"});});
    expect(result.current.items).toHaveLength(1); expect(readCustomerEventListSchedule()).toBeNull();
    login("A"); act(() => stale.clearItems()); expect(result.current.items).toHaveLength(1);
  });
  it("restores only the UID namespace after remount/refresh", () => {
    login("A"); expect(addCustomerEventListItem(item)).toBe(true);
    const first = renderHook(useCustomerEventList); first.unmount();
    login("B"); const second = renderHook(useCustomerEventList); expect(second.result.current.items).toEqual([]); second.unmount();
    login("A"); const third = renderHook(useCustomerEventList); expect(third.result.current.items).toHaveLength(1);
  });
  it("leaves legacy ownerless data intact and fails closed for every account", () => {
    const legacy = JSON.stringify({version: 1, items: [item]});
    localStorage.setItem(CUSTOMER_EVENT_LIST_STORAGE_KEY, legacy);
    localStorage.setItem(CUSTOMER_EVENT_LIST_SCHEDULE_STORAGE_KEY, JSON.stringify({eventDate: "2027-01-02", eventTime: "10:00"}));
    for (const uid of ["A", "B", null]) {login(uid); expect(readCustomerEventList()).toEqual([]); expect(readCustomerEventListSchedule()).toBeNull(); clearCustomerEventList();}
    expect(localStorage.getItem(CUSTOMER_EVENT_LIST_STORAGE_KEY)).toBe(legacy);
    expect(localStorage.getItem(CUSTOMER_EVENT_LIST_SCHEDULE_STORAGE_KEY)).not.toBeNull();
  });
  it("rejects guest storage mutations and drawer requests despite cosmetic authentication", () => {
    render(<CustomerEventListMenu authenticated />);
    expect(screen.getByRole("button", {name: /event list/i})).toBeDisabled();
    expect(addCustomerEventListItem(item)).toBe(false); writeCustomerEventListSchedule({eventDate: "2027-01-02", eventTime: "10:00"});
    act(() => openCustomerEventList()); fireEvent(window, new Event("feasta:open-customer-event-list"));
    expect(localStorage.length).toBe(0); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("closes an open drawer on direct A to B switching", () => {
    login("A"); render(<CustomerEventListMenu authenticated />);
    fireEvent.click(screen.getByRole("button", {name: /event list/i}));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    login("B"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
