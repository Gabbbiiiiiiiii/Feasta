import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  adminAuditLogMatchesFilters,
  normalizeAdminAuditLogFilters,
  normalizeAdminAuditLogRecord,
} from "@/lib/admin/audit-logs/admin-audit-log-normalization";
import type {
  AdminAuditLog,
  AdminAuditLogPage,
} from "@/lib/admin/audit-logs/admin-audit-log-types";

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
}));

vi.mock("@/app/admin/audit-logs/actions", () => ({
  loadAdminAuditLogsAction: mocks.load,
}));

import AdminAuditLogsError from "@/app/admin/audit-logs/error";
import {AuditLogBrowserClient} from "@/components/admin/audit-logs/audit-log-browser-client";

const auditLogFixture: AdminAuditLog = {
  id: "audit_01",
  createdAt: "2026-08-07T02:30:00.000Z",
  action: "provider_verification_approved",
  actorId: "admin_01",
  actorRole: "admin",
  targetCollection: "providers",
  targetId: "provider_01",
  source: "admin_web",
  correlationId: "correlation_01",
  outcome: "succeeded",
  reasonCode: null,
  summary: "Changed: Verification Status",
};

function pageFixture(
  auditLogs: AdminAuditLog[] = [auditLogFixture],
  overrides: Partial<AdminAuditLogPage> = {},
): AdminAuditLogPage {
  return {
    auditLogs,
    summary: {
      windowLimit: 100,
      windowCount: auditLogs.length,
      adminActorCount: auditLogs.length,
      succeededOutcomeCount: auditLogs.length,
      attentionOutcomeCount: 0,
    },
    filterOptions: {
      actions: ["provider_verification_approved"],
      actorRoles: ["admin", "provider"],
      sources: ["admin_web", "cloud_function"],
      targetCollections: ["providers", "users"],
    },
    nextCursor: null,
    hasMore: false,
    scan: {
      scannedCount: auditLogs.length,
      scanLimit: 21,
      filtered: false,
      reachedLimit: false,
    },
    ...overrides,
  };
}

describe("Admin audit log browser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue(pageFixture());
  });

  it("renders bounded counts, safe event data, and detail links", () => {
    render(<AuditLogBrowserClient initialPage={pageFixture()} />);

    expect(
      screen.getByRole("heading", {name: "Audit Logs"}),
    ).toBeVisible();
    expect(screen.getByText("Events in latest window")).toBeVisible();
    expect(
      screen.getByText(/They are not lifetime totals/u),
    ).toBeVisible();
    expect(
      screen.getAllByRole("link", {name: /View audit event|View/u})[0],
    ).toHaveAttribute("href", "/admin/audit-logs/audit_01");
    expect(
      screen.getAllByText("Changed: Verification Status").length,
    ).toBeGreaterThan(0);
    expect(document.querySelector("script")).toBeNull();
  });

  it("shows distinct unfiltered and filtered empty states", async () => {
    const {rerender} = render(
      <AuditLogBrowserClient initialPage={pageFixture([])} />,
    );

    expect(
      screen.getByText("No audit events in the latest window"),
    ).toBeVisible();

    rerender(
      <AuditLogBrowserClient
        initialPage={pageFixture([], {
          scan: {
            scannedCount: 250,
            scanLimit: 250,
            filtered: true,
            reachedLimit: true,
          },
          nextCursor: "older_cursor",
          hasMore: true,
        })}
      />,
    );

    const user = userEvent.setup();
    mocks.load.mockResolvedValue(
      pageFixture([], {
        scan: {
          scannedCount: 250,
          scanLimit: 250,
          filtered: true,
          reachedLimit: true,
        },
        nextCursor: "older_cursor",
        hasMore: true,
      }),
    );
    await user.selectOptions(
      screen.getByLabelText("Action"),
      "provider_verification_approved",
    );

    expect(
      await screen.findByText("No matching audit events in this scan"),
    ).toBeVisible();
    expect(screen.getByText(/at most 250 timestamped events/u)).toBeVisible();
  });

  it("submits exact filters and bounded page sizes", async () => {
    const user = userEvent.setup();
    render(<AuditLogBrowserClient initialPage={pageFixture()} />);

    await user.selectOptions(
      screen.getByLabelText("Actor role"),
      "provider",
    );

    await waitFor(() => {
      expect(mocks.load).toHaveBeenCalledWith(
        expect.objectContaining({
          actorRole: "provider",
          pageSize: 20,
          cursor: null,
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText("Rows per page")).toBeEnabled();
    });
    await user.selectOptions(
      screen.getByLabelText("Rows per page"),
      "30",
    );

    await waitFor(() => {
      expect(mocks.load).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pageSize: 30,
          cursor: null,
        }),
      );
    });
  });

  it("uses opaque cursors without offset pagination", async () => {
    const user = userEvent.setup();
    mocks.load.mockResolvedValue(pageFixture([]));
    render(
      <AuditLogBrowserClient
        initialPage={pageFixture([auditLogFixture], {
          nextCursor: "opaque_cursor",
          hasMore: true,
        })}
      />,
    );

    await user.click(screen.getByRole("button", {name: "Next"}));

    await waitFor(() => {
      expect(mocks.load).toHaveBeenCalledWith(
        expect.objectContaining({cursor: "opaque_cursor"}),
      );
    });
  });

  it("renders a retryable error without exposing server details", async () => {
    const user = userEvent.setup();
    mocks.load.mockRejectedValue(
      new Error("credential=do-not-render"),
    );
    render(<AuditLogBrowserClient initialPage={pageFixture()} />);

    await user.type(
      screen.getByLabelText("Search audit events"),
      "admin_01",
    );
    await user.click(screen.getByRole("button", {name: "Search"}));

    expect(
      await screen.findByText(
        "Audit events could not be loaded. Try the request again.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/do-not-render/u)).not.toBeInTheDocument();
  });

  it("contains no mutation or destructive controls", () => {
    render(<AuditLogBrowserClient initialPage={pageFixture()} />);

    for (const label of ["Edit", "Delete", "Restore", "Archive", "Change"]) {
      expect(
        screen.queryByRole("button", {name: new RegExp(label, "iu")}),
      ).not.toBeInTheDocument();
    }
  });

  it("uses a generic route-level error state", () => {
    render(
      <AdminAuditLogsError
        error={new Error("secret backend detail")}
        reset={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        "Audit logs could not be loaded. No records were changed.",
      ),
    ).toBeVisible();
    expect(screen.queryByText(/secret backend detail/u)).not.toBeInTheDocument();
  });
});

describe("Audit log normalization and filtering", () => {
  it("defensively normalizes legacy optional fields", () => {
    const normalized = normalizeAdminAuditLogRecord("legacy_01", {
      action: "provider_verification_rejected",
      actorId: "admin_legacy",
      actorRole: "admin",
      entity: "provider",
      entityId: "provider_legacy",
      createdAt: {
        toMillis: () => Date.parse("2026-08-07T01:00:00.000Z"),
      },
      details: {
        previousStatus: "pending",
        nested: {large: "object"},
        accessToken: "must-never-render",
        privateNote: "must-also-be-redacted",
        reason: "internal-only explanation",
      },
    });

    expect(normalized.auditLog.targetCollection).toBe("provider");
    expect(normalized.auditLog.targetId).toBe("provider_legacy");
    expect(normalized.auditLog.source).toBe("Not recorded");
    expect(normalized.auditLog.createdAt).toBe(
      "2026-08-07T01:00:00.000Z",
    );
    expect(normalized.detail.metadataPreview).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "nested",
          value: "Nested object",
          redacted: false,
        }),
        expect.objectContaining({
          key: "accessToken",
          value: "Redacted",
          redacted: true,
        }),
        expect.objectContaining({
          key: "privateNote",
          value: "Redacted",
          redacted: true,
        }),
        expect.objectContaining({
          key: "reason",
          value: "Redacted",
          redacted: true,
        }),
      ]),
    );
  });

  it("does not fail records with missing canonical fields", () => {
    const normalized = normalizeAdminAuditLogRecord("legacy_empty", {});

    expect(normalized.auditLog).toMatchObject({
      id: "legacy_empty",
      action: "unknown_action",
      actorId: "Not recorded",
      actorRole: "Not recorded",
      targetCollection: "Not recorded",
      targetId: "Not recorded",
      source: "Not recorded",
      createdAt: null,
    });
  });

  it("bounds page size and search length", () => {
    const filters = normalizeAdminAuditLogFilters({
      search: "x".repeat(300),
      action: "all",
      actorRole: "all",
      source: "all",
      targetCollection: "all",
      fromDate: "",
      toDate: "",
      pageSize: 5_000,
      cursor: null,
    });

    expect(filters.pageSize).toBe(30);
    expect(filters.search).toHaveLength(120);
  });

  it("matches only accurate search fields and exact filters", () => {
    const record = normalizeAdminAuditLogRecord("audit_search", {
      action: "user_account_blocked",
      actorId: "administrator_123",
      actorRole: "admin",
      targetCollection: "users",
      targetId: "customer_456",
      source: "admin_web",
      correlationId: "request_789",
      description: "A phrase that is not an indexed identifier",
      createdAt: "2026-08-07T02:00:00.000Z",
    });
    const baseInput = {
      action: "user_account_blocked",
      actorRole: "admin",
      source: "admin_web",
      targetCollection: "users",
      fromDate: "2026-08-07",
      toDate: "2026-08-07",
      pageSize: 20,
      cursor: null,
    };

    for (const search of [
      "administrator_123",
      "customer_456",
      "request_789",
      "account_blocked",
    ]) {
      expect(
        adminAuditLogMatchesFilters(
          record,
          normalizeAdminAuditLogFilters({...baseInput, search}),
        ),
      ).toBe(true);
    }
    expect(
      adminAuditLogMatchesFilters(
        record,
        normalizeAdminAuditLogFilters({
          ...baseInput,
          search: "not an indexed identifier",
        }),
      ),
    ).toBe(false);
  });

  it("rejects inverted Manila date ranges", () => {
    expect(() =>
      normalizeAdminAuditLogFilters({
        search: "",
        action: "all",
        actorRole: "all",
        source: "all",
        targetCollection: "all",
        fromDate: "2026-08-08",
        toDate: "2026-08-07",
        pageSize: 20,
        cursor: null,
      }),
    ).toThrow(/start date cannot be after/u);
  });
});

describe("Audit log authorization and persistence contracts", () => {
  const source = (path: string) =>
    readFileSync(resolve(process.cwd(), path), "utf8");

  it("requires administrator authorization at every server entry point", () => {
    const page = source("src/app/admin/audit-logs/page.tsx");
    const detailPage = source(
      "src/app/admin/audit-logs/[auditLogId]/page.tsx",
    );
    const actions = source("src/app/admin/audit-logs/actions.ts");
    const service = source(
      "src/lib/admin/audit-logs/admin-audit-log-service.ts",
    );

    expect(page).toContain("await requireAdmin()");
    expect(detailPage).toContain("await requireAdmin()");
    expect(actions).toContain("await requireAdmin()");

    for (const functionName of [
      "getAdminAuditLogPage",
      "getAdminAuditLogDetail",
    ]) {
      const entry = service.slice(
        service.indexOf(`export async function ${functionName}`),
      );
      expect(entry.indexOf("await requireAdmin()")).toBeGreaterThanOrEqual(0);
      expect(entry.indexOf("await requireAdmin()")).toBeLessThan(
        entry.indexOf("adminDb"),
      );
    }
  });

  it("keeps all reads and in-memory search bounded", () => {
    const service = source(
      "src/lib/admin/audit-logs/admin-audit-log-service.ts",
    );
    const normalization = source(
      "src/lib/admin/audit-logs/admin-audit-log-normalization.ts",
    );

    expect(service).toContain("const SEARCH_SCAN_LIMIT = 250");
    expect(service).toContain("const SUMMARY_WINDOW_LIMIT = 100");
    expect(service).toContain(".limit(queryLimit)");
    expect(service).toContain(".limit(SUMMARY_WINDOW_LIMIT)");
    expect(normalization).toContain("const MAX_PAGE_SIZE = 30");
    expect(normalization).toContain("const MAX_SEARCH_LENGTH = 120");
  });

  it("implements newest-first opaque cursor pagination", () => {
    const service = source(
      "src/lib/admin/audit-logs/admin-audit-log-service.ts",
    );

    expect(service).toContain('.orderBy("createdAt", "desc")');
    expect(service).toContain(".orderBy(FieldPath.documentId(),");
    expect(service).toContain("query.startAfter(");
    expect(service).toContain('toString("base64url")');
    expect(service).not.toContain(".offset(");
  });

  it("keeps Firebase Admin isolated from client code and tests", () => {
    const client = source(
      "src/components/admin/audit-logs/audit-log-browser-client.tsx",
    );
    const detailPage = source(
      "src/app/admin/audit-logs/[auditLogId]/page.tsx",
    );
    const service = source(
      "src/lib/admin/audit-logs/admin-audit-log-service.ts",
    );

    expect(service.startsWith('import "server-only"')).toBe(true);
    expect(client).not.toContain("admin-audit-log-service");
    expect(client).not.toContain("firebase/admin");
    expect(client).not.toContain("server-only");
    expect(detailPage).not.toContain("firebase/admin");
  });

  it("remains read-only and sends no raw record JSON to the browser", () => {
    const service = source(
      "src/lib/admin/audit-logs/admin-audit-log-service.ts",
    );
    const client = source(
      "src/components/admin/audit-logs/audit-log-browser-client.tsx",
    );

    expect(service).not.toContain(".delete(");
    expect(service).not.toContain(".update(");
    expect(service).not.toContain(".set(");
    expect(service).not.toContain("runTransaction");
    expect(client).not.toContain("beforePreview");
    expect(client).not.toContain("afterPreview");
    expect(client).not.toContain("metadataPreview");
  });
});
