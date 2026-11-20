import {act, fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";
import {publishedAnnouncement} from "@/lib/announcements/announcement";

const mocks = vi.hoisted(() => ({auth: vi.fn(), snapshot: vi.fn(), stop: vi.fn(), stopAuth: vi.fn(), where: vi.fn((...args: unknown[]) => args), order: vi.fn((...args: unknown[]) => args), limit: vi.fn((value: number) => value)}));
vi.mock("@/lib/firebase/client", () => ({auth: {}, db: {}}));
vi.mock("firebase/auth", () => ({onAuthStateChanged: mocks.auth}));
vi.mock("firebase/firestore", () => ({collection: () => "announcements", query: (...args: unknown[]) => args, where: mocks.where, orderBy: mocks.order, limit: mocks.limit, onSnapshot: mocks.snapshot}));
import {AnnouncementFeed} from "@/components/announcements/announcement-feed";

const data = {title: "Booking reminder", content: "Review your details before submitting.", audience: "customers", status: "published", isDeleted: false, publishedAt: {toDate: () => new Date("2026-11-16T12:00:00Z")}};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockImplementation((_auth, callback) => {callback({uid: "customer"}); return mocks.stopAuth;});
  mocks.snapshot.mockReturnValue(mocks.stop);
});
function publish(rows: Record<string, unknown>[]) {
  act(() => mocks.snapshot.mock.calls.at(-1)![1]({size: rows.length, docs: rows.map((row, index) => ({id: String(index), data: () => row}))}));
}
it.each(["customer", "provider"] as const)("queries only published nondeleted announcements for %s and everyone", (role) => {
  const view = render(<AnnouncementFeed role={role} />);
  expect(mocks.where).toHaveBeenCalledWith("status", "==", "published");
  expect(mocks.where).toHaveBeenCalledWith("isDeleted", "==", false);
  expect(mocks.where).toHaveBeenCalledWith("audience", "in", ["everyone", role === "customer" ? "customers" : "providers"]);
  expect(mocks.order).toHaveBeenCalledWith("publishedAt", "desc");
  view.unmount(); expect(mocks.stop).toHaveBeenCalled(); expect(mocks.stopAuth).toHaveBeenCalled();
});
it.each([
  {status: "draft"}, {status: "archived"}, {status: "scheduled"}, {isDeleted: true}, {audience: "providers"}, {audience: "admins"}, {publishedAt: null}, {title: ""},
])("rejects ineligible or malformed records %j", (changes) => {
  expect(publishedAnnouncement("id", {...data, ...changes}, "customer")).toBeNull();
});
it("accepts everyone for both roles and strips private fields", () => {
  for (const role of ["customer", "provider"] as const) {
    const item = publishedAnnouncement("id", {...data, audience: "everyone", adminNotes: "Private"}, role);
    expect(item?.title).toBe(data.title); expect(item).not.toHaveProperty("adminNotes");
  }
});
it("updates the feed live when an announcement is archived", () => {
  render(<AnnouncementFeed role="customer" />);
  publish([data]); expect(screen.getByText(data.title)).toBeVisible();
  publish([]); expect(screen.queryByText(data.title)).not.toBeInTheDocument();
  expect(screen.getByText("No published announcements for you right now.")).toBeVisible();
});
it("clears displayed content on authorization errors and supports retry", () => {
  render(<AnnouncementFeed role="customer" />); publish([data]);
  act(() => mocks.snapshot.mock.calls.at(-1)![2](new Error("denied")));
  expect(screen.queryByText(data.title)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", {name: "Retry announcements"}));
  expect(mocks.snapshot).toHaveBeenCalledTimes(2);
});
it("loads more without mixing announcements with personal unread counts", () => {
  render(<AnnouncementFeed role="customer" />); publish(Array.from({length: 11}, () => data));
  expect(screen.getAllByText(data.title)).toHaveLength(10);
  fireEvent.click(screen.getByRole("button", {name: "Show more announcements"}));
  expect(mocks.limit).toHaveBeenLastCalledWith(21);
});
it("clears announcements when the user signs out", () => {
  render(<AnnouncementFeed role="customer" />); publish([data]);
  act(() => mocks.auth.mock.calls[0][1](null));
  expect(screen.queryByText(data.title)).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toBeVisible();
});

it("shows everyone previews in the bell and signals new publications only after initial load", () => {
  const availability = vi.fn();
  const ring = vi.fn();
  render(<AnnouncementFeed role="provider" compact onAvailability={availability} onNew={ring} />);
  publish([{...data, audience: "everyone"}]);
  expect(screen.getByRole("link", {name: /Booking reminder/})).toHaveAttribute("href", "/provider/notifications#official-announcements");
  expect(availability).toHaveBeenLastCalledWith(1);
  expect(ring).not.toHaveBeenCalled();
  publish([{...data, audience: "everyone"}, {...data, audience: "providers", title: "New provider notice"}]);
  expect(ring).toHaveBeenCalledTimes(1);
  publish([{...data, audience: "everyone"}, {...data, audience: "providers", title: "New provider notice"}]);
  expect(ring).toHaveBeenCalledTimes(1);
  publish([]);
  expect(availability).toHaveBeenLastCalledWith(0);
  expect(ring).toHaveBeenCalledTimes(1);
});

it("ignores stale snapshot callbacks after switching accounts", () => {
  render(<AnnouncementFeed role="customer" />);
  const oldCallback = mocks.snapshot.mock.calls[0][1];
  act(() => mocks.auth.mock.calls[0][1](null));
  act(() => oldCallback({size: 1, docs: [{id: "stale", data: () => data}]}));
  expect(screen.queryByText(data.title)).not.toBeInTheDocument();
});
