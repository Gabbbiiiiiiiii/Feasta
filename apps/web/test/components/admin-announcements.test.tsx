import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {AnnouncementManagementClient} from "@/components/admin/announcements/announcement-management-client";
import {
  assertAnnouncementEditable,
  assertAnnouncementTransition,
  validateAnnouncementDraftInput,
  validateArchiveInput,
  validatePublishInput,
} from "@/lib/admin/announcements/admin-announcement-validation";
import type {
  AdminAnnouncement,
  AdminAnnouncementPage,
} from "@/lib/admin/announcements/admin-announcement-types";

const actions = vi.hoisted(() => ({
  archive: vi.fn(),
  create: vi.fn(),
  load: vi.fn(),
  publish: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/app/admin/announcements/actions", () => ({
  archiveAnnouncementAction: actions.archive,
  createAnnouncementAction: actions.create,
  loadAdminAnnouncementsAction: actions.load,
  publishAnnouncementAction: actions.publish,
  updateAnnouncementAction: actions.update,
}));

const statistics = {
  totalCount: 0,
  draftCount: 0,
  publishedCount: 0,
  archivedCount: 0,
};

const emptyPage: AdminAnnouncementPage = {
  announcements: [],
  statistics,
  nextCursor: null,
  hasMore: false,
};

const draft: AdminAnnouncement = {
  id: "announcement_maintenance",
  title: "Scheduled maintenance",
  content: "FEASTA will be unavailable from 10:00 PM until 11:00 PM tonight.",
  audience: "everyone",
  status: "draft",
  adminNotes: "Coordinate with support before publication.",
  createdAt: "2026-08-07T01:00:00.000Z",
  createdBy: "admin-one",
  updatedAt: "2026-08-07T01:00:00.000Z",
  updatedBy: "admin-one",
  publishedAt: null,
  publishedBy: null,
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
};

function pageWith(announcement: AdminAnnouncement): AdminAnnouncementPage {
  return {
    announcements: [announcement],
    statistics: {
      ...statistics,
      totalCount: 1,
      draftCount: announcement.status === "draft" ? 1 : 0,
      publishedCount: announcement.status === "published" ? 1 : 0,
      archivedCount: announcement.status === "archived" ? 1 : 0,
    },
    nextCursor: null,
    hasMore: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.load.mockResolvedValue(emptyPage);
  actions.create.mockResolvedValue({announcementId: "new-announcement"});
  actions.update.mockResolvedValue(undefined);
  actions.publish.mockResolvedValue(undefined);
  actions.archive.mockResolvedValue(undefined);
});

describe("Admin announcements management", () => {
  it("renders the operational empty state", () => {
    render(<AnnouncementManagementClient initialPage={emptyPage} />);

    expect(screen.getByRole("heading", {name: "Announcements"})).toBeVisible();
    expect(screen.getByText("No announcements yet")).toBeVisible();
    expect(screen.getByRole("button", {name: "Create announcement"})).toBeEnabled();
  });

  it("requires a confirmation before publishing", async () => {
    const user = userEvent.setup();
    actions.load.mockResolvedValue(pageWith({...draft, status: "published"}));
    render(<AnnouncementManagementClient initialPage={pageWith(draft)} />);

    await user.click(
      screen.getAllByRole("button", {name: "View Scheduled maintenance"})[0]!,
    );
    await user.click(screen.getByRole("button", {name: "Publish"}));

    expect(
      screen.getByRole("heading", {name: "Publish this announcement?"}),
    ).toBeVisible();
    expect(actions.publish).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", {name: "Publish announcement"}),
    );
    await waitFor(() => expect(actions.publish).toHaveBeenCalledWith({
      announcementId: draft.id,
      confirmed: true,
    }));
  });

  it("does not offer edit or publish actions for archived records", async () => {
    const user = userEvent.setup();
    const archived = {
      ...draft,
      status: "archived" as const,
      archivedAt: "2026-08-07T02:00:00.000Z",
      archivedBy: "admin-two",
      archiveReason: "The maintenance window has passed.",
    };
    render(<AnnouncementManagementClient initialPage={pageWith(archived)} />);

    await user.click(
      screen.getAllByRole("button", {name: "View Scheduled maintenance"})[0]!,
    );

    expect(screen.queryByRole("button", {name: "Edit draft"})).not.toBeInTheDocument();
    expect(screen.queryByRole("button", {name: "Publish"})).not.toBeInTheDocument();
    expect(
      screen.getByText("This announcement is archived and cannot be edited or republished."),
    ).toBeVisible();
  });
});

describe("Announcement server validation and lifecycle", () => {
  const validDraft = {
    title: "Service availability update",
    content: "FEASTA services are operating normally across all supported channels.",
    audience: "customers",
    adminNotes: "Approved by operations.",
  };

  it("rejects incomplete or invalid announcement content", () => {
    expect(() => validateAnnouncementDraftInput({
      ...validDraft,
      title: "No",
    })).toThrow(/Title must be between/u);
    expect(() => validateAnnouncementDraftInput({
      ...validDraft,
      content: "Too short",
    })).toThrow(/Content must be between/u);
    expect(() => validateAnnouncementDraftInput({
      ...validDraft,
      audience: "selected-user",
    })).toThrow(/valid announcement audience/u);
  });

  it("enforces publication confirmation and archive reason validation", () => {
    expect(() => validatePublishInput({
      announcementId: "announcement_1",
      confirmed: false,
    })).toThrow(/explicitly confirmed/u);
    expect(() => validateArchiveInput({
      announcementId: "announcement_1",
      reason: "short",
    })).toThrow(/between 10 and 500/u);
  });

  it("enforces canonical lifecycle transitions", () => {
    expect(() => assertAnnouncementEditable("draft")).not.toThrow();
    expect(() => assertAnnouncementEditable("published")).toThrow(
      /Only draft announcements/u,
    );
    expect(() => assertAnnouncementTransition("draft", "published")).not.toThrow();
    expect(() => assertAnnouncementTransition("scheduled", "published")).not.toThrow();
    expect(() => assertAnnouncementTransition("published", "draft")).toThrow(
      /cannot transition/u,
    );
    expect(() => assertAnnouncementTransition("archived", "published")).toThrow(
      /cannot transition/u,
    );
  });

  it("rejects forged identity, timestamps, state, recipients, and navigation metadata", () => {
    for (const forged of [
      {actorId: "forged-admin"},
      {publishedAt: "2000-01-01T00:00:00.000Z"},
      {status: "published"},
      {recipientIds: ["victim"]},
      {navigationUrl: "https://attacker.test"},
    ]) {
      expect(() => validateAnnouncementDraftInput({
        ...validDraft,
        ...forged,
      })).toThrow(/managed by the server/u);
    }
  });
});

describe("Announcement authorization and persistence contracts", () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

  it("requires administrator authorization before every read and mutation", () => {
    const page = source("src/app/admin/announcements/page.tsx");
    const actionsSource = source("src/app/admin/announcements/actions.ts");
    const service = source(
      "src/lib/admin/announcements/admin-announcement-service.ts",
    );

    expect(page).toContain("await requireAdmin()");
    expect(actionsSource.match(/await requireAdmin\(\)/gu)).toHaveLength(5);
    for (const functionName of [
      "getAdminAnnouncementPage",
      "createAnnouncement",
      "updateAnnouncement",
      "publishAnnouncement",
      "archiveAnnouncement",
    ]) {
      const entry = service.slice(
        service.indexOf("export async function " + functionName),
      );
      expect(entry.indexOf("await requireAdmin()")).toBeGreaterThanOrEqual(0);
      expect(entry.indexOf("await requireAdmin()")).toBeLessThan(
        entry.indexOf("adminDb."),
      );
    }
  });

  it("keeps reads bounded and writes immutable audit records atomically", () => {
    const service = source(
      "src/lib/admin/announcements/admin-announcement-service.ts",
    );

    expect(service).toContain("const MAX_FILTER_SCAN = 300");
    expect(service).toContain(".limit(SCAN_BATCH_SIZE)");
    expect(service).toContain(".count().get()");
    expect(service).toContain("transaction.create(adminDb.collection(ADMIN_LOGS_COLLECTION).doc()");
    expect(service).not.toContain(".delete(");
  });

  it("isolates private notes and performs no unsafe notification fan-out", () => {
    const service = source(
      "src/lib/admin/announcements/admin-announcement-service.ts",
    );

    expect(service).toContain('const PRIVATE_COLLECTION = "private"');
    expect(service).toContain(".collection(PRIVATE_COLLECTION)");
    expect(service).not.toContain('collection("notifications")');
    expect(service).not.toContain("recipientIds");
    expect(service).not.toContain("navigationUrl");
  });
});
it("retries the failed announcements page with its filters, cursor, and history", async () => {
  const user = userEvent.setup();
  const first = {...pageWith(draft), nextCursor: "announcements-page-2", hasMore: true};
  actions.load.mockResolvedValueOnce(first).mockRejectedValueOnce(new Error("Read failed")).mockResolvedValueOnce({...pageWith({...draft, id: "page-two", title: "Second page notice"}), nextCursor: null});
  render(<AnnouncementManagementClient initialPage={pageWith(draft)} />);
  await user.selectOptions(screen.getByLabelText("Status"), "draft");
  await waitFor(() => expect(screen.getByRole("button", {name: "Next"})).toBeEnabled());
  await user.click(screen.getByRole("button", {name: "Next"}));
  expect(await screen.findByText("Read failed")).toBeVisible();
  expect(screen.queryByText("No announcements yet")).not.toBeInTheDocument();
  expect(screen.getByText("Showing 1 announcement")).toBeVisible();
  const failedRequest = actions.load.mock.calls[1][0];
  expect(failedRequest).toMatchObject({status: "draft", cursor: "announcements-page-2"});
  await user.click(screen.getByRole("button", {name: "Try again"}));
  await waitFor(() => expect(actions.load).toHaveBeenCalledTimes(3));
  expect(actions.load.mock.calls[2][0]).toEqual(failedRequest);
  expect((await screen.findAllByText("Second page notice"))[0]).toBeVisible();
  expect(screen.getByLabelText("Status")).toHaveValue("draft");
  actions.load.mockResolvedValueOnce(first);
  await user.click(screen.getByRole("button", {name: "Previous"}));
  await waitFor(() => expect(actions.load.mock.calls[3][0]).toMatchObject({status: "draft", cursor: null}));
});

it("retries a failed new announcement filter rather than the previous successful filter", async () => {
  const user = userEvent.setup();
  actions.load.mockRejectedValueOnce(new Error("Filtered read failed")).mockResolvedValueOnce(emptyPage);
  render(<AnnouncementManagementClient initialPage={pageWith(draft)} />);
  await user.selectOptions(screen.getByLabelText("Audience"), "providers");
  expect(await screen.findByText("Filtered read failed")).toBeVisible();
  await user.click(screen.getByRole("button", {name: "Try again"}));
  await waitFor(() => expect(actions.load).toHaveBeenCalledTimes(2));
  expect(actions.load.mock.calls[1][0]).toEqual(actions.load.mock.calls[0][0]);
  expect(actions.load.mock.calls[1][0]).toMatchObject({audience: "providers", cursor: null});
  expect(screen.getByLabelText("Audience")).toHaveValue("providers");
  expect(await screen.findByText("No matching announcements")).toBeVisible();
});
