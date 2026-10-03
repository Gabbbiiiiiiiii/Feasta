"use client";

import {
  Archive,
  Eye,
  FilePenLine,
  Megaphone,
  Plus,
  Radio,
} from "lucide-react";
import {
  useCallback,
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import {
  archiveAnnouncementAction,
  createAnnouncementAction,
  loadAdminAnnouncementsAction,
  publishAnnouncementAction,
  updateAnnouncementAction,
} from "@/app/admin/announcements/actions";
import {CursorPagination} from "@/components/data/cursor-pagination";
import {DataTable, type DataTableColumn} from "@/components/data/data-table";
import {DetailDrawer} from "@/components/data/detail-drawer";
import {FilterToolbar} from "@/components/data/filter-toolbar";
import {SummaryCard} from "@/components/data/summary-card";
import {feastaToast} from "@/components/feedback/toast";
import {FormField} from "@/components/forms/form-field";
import {PageHeading} from "@/components/layout/page-heading";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {Badge, type BadgeProps} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Textarea} from "@/components/ui/textarea";
import type {
  AdminAnnouncement,
  AdminAnnouncementAudienceFilter,
  AdminAnnouncementFilters,
  AdminAnnouncementPage,
  AdminAnnouncementStatusFilter,
  AnnouncementDraftInput,
} from "@/lib/admin/announcements/admin-announcement-types";

type AnnouncementManagementClientProps = {
  initialPage: AdminAnnouncementPage;
};

const DEFAULT_FILTERS: AdminAnnouncementFilters = {
  search: "",
  status: "all",
  audience: "all",
  pageSize: 10,
  cursor: null,
};

const EMPTY_DRAFT: AnnouncementDraftInput = {
  title: "",
  content: "",
  audience: "everyone",
  adminNotes: "",
};

function AnnouncementManagementClient({
  initialPage,
}: AnnouncementManagementClientProps) {
  const [page, setPage] = useState(initialPage);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [searchValue, setSearchValue] = useState("");
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [pageError, setPageError] = useState<string>();
  const [selected, setSelected] = useState<AdminAnnouncement | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAnnouncement | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [mutation, setMutation] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const loadPage = useCallback((
    nextFilters: AdminAnnouncementFilters,
    cursor: string | null,
    history: (string | null)[],
  ) => {
    setPageError(undefined);
    const request = {...nextFilters, cursor};
    startTransition(async () => {
      try {
        const result = await loadAdminAnnouncementsAction(request);
        setPage(result);
        setFilters(request);
        setCursorHistory(history);
      } catch (error: unknown) {
        setPageError(errorMessage(error));
      }
    });
  }, []);

  const reloadFirstPage = useCallback(async () => {
    const request = {...filters, cursor: null};
    const result = await loadAdminAnnouncementsAction(request);
    setPage(result);
    setFilters(request);
    setCursorHistory([null]);
    setSelected(null);
    setDrawerOpen(false);
  }, [filters]);

  const applyFilters = useCallback((changes: Partial<AdminAnnouncementFilters>) => {
    loadPage({...filters, ...changes, cursor: null}, null, [null]);
  }, [filters, loadPage]);

  const clearFilters = useCallback(() => {
    setSearchValue("");
    loadPage(DEFAULT_FILTERS, null, [null]);
  }, [loadPage]);

  const runMutation = useCallback(async (
    name: string,
    operation: () => Promise<unknown>,
    successMessage: string,
  ) => {
    if (mutation) return;
    setMutation(name);
    try {
      await operation();
      await reloadFirstPage();
      setPublishOpen(false);
      setArchiveOpen(false);
      setEditorOpen(false);
      setArchiveReason("");
      feastaToast.success(successMessage);
    } catch (error: unknown) {
      feastaToast.error(errorMessage(error));
    } finally {
      setMutation(undefined);
    }
  }, [mutation, reloadFirstPage]);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = () => {
    if (!selected || selected.status !== "draft") return;
    setEditing(selected);
    setEditorOpen(true);
  };
  const activeFilters = useMemo(() => filterLabels(filters), [filters]);
  const columns = useMemo<readonly DataTableColumn<AdminAnnouncement>[]>(() => [
    {
      id: "title",
      header: "Announcement",
      cell: (announcement) => (
        <div className="grid gap-1">
          <span className="font-bold">{announcement.title}</span>
          <span className="line-clamp-2 text-muted-foreground">
            {announcement.content}
          </span>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (announcement) => <StatusBadge status={announcement.status} />,
    },
    {
      id: "audience",
      header: "Audience",
      cell: (announcement) => audienceLabel(announcement.audience),
    },
    {
      id: "updatedAt",
      header: "Last updated",
      cell: (announcement) => formatDate(announcement.updatedAt),
    },
  ], []);

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="Administration"
        title="Announcements"
        description="Create, review, publish, and archive official FEASTA announcements for the right audience."
        actions={(
          <Button onClick={openCreate}>
            <Plus aria-hidden="true" />
            Create announcement
          </Button>
        )}
      />

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Announcement statistics"
      >
        <SummaryCard
          label="All announcements"
          value={page.statistics.totalCount}
          icon={<Megaphone />}
        />
        <SummaryCard
          label="Drafts"
          value={page.statistics.draftCount}
          icon={<FilePenLine />}
        />
        <SummaryCard
          label="Published"
          value={page.statistics.publishedCount}
          icon={<Radio />}
        />
        <SummaryCard
          label="Archived"
          value={page.statistics.archivedCount}
          icon={<Archive />}
        />
      </section>

      <FilterToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={(search) => applyFilters({search})}
        onClearFilters={clearFilters}
        activeFilters={activeFilters}
        loading={isPending}
        searchLabel="Search announcements"
        searchPlaceholder="Search title, content, or ID"
        filterControls={(
          <>
            <label className="grid gap-2 text-sm font-bold">
              Status
              <Select
                value={filters.status}
                disabled={isPending}
                onChange={(event) => applyFilters({
                  status: event.currentTarget.value as AdminAnnouncementStatusFilter,
                })}
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="published">Published</option>
                <option value="expired">Expired</option>
                <option value="archived">Archived</option>
              </Select>
            </label>
            <label className="grid gap-2 text-sm font-bold">
              Audience
              <Select
                value={filters.audience}
                disabled={isPending}
                onChange={(event) => applyFilters({
                  audience: event.currentTarget.value as AdminAnnouncementAudienceFilter,
                })}
              >
                <option value="all">All audiences</option>
                <option value="everyone">Everyone</option>
                <option value="customers">Customers</option>
                <option value="providers">Providers</option>
                <option value="admins">Administrators</option>
              </Select>
            </label>
          </>
        )}
      />

      <DataTable
        columns={columns}
        rows={page.announcements}
        getRowId={(announcement) => announcement.id}
        caption="FEASTA announcement records"
        loading={isPending}
        error={pageError}
        emptyTitle={activeFilters.length ? "No matching announcements" : "No announcements yet"}
        emptyDescription={activeFilters.length
          ? "Try changing your search or clearing a filter."
          : "Create a draft to prepare the first official FEASTA announcement."}
        rowActionsLabel="Details"
        rowActions={(announcement) => (
          <Button
            variant="secondary"
            size="compact"
            onClick={() => {
              setSelected(announcement);
              setDrawerOpen(true);
            }}
            aria-label={`View ${announcement.title}`}
          >
            <Eye aria-hidden="true" />
            View
          </Button>
        )}
        renderMobileRow={(announcement) => (
          <AnnouncementMobileCard
            announcement={announcement}
            onView={() => {
              setSelected(announcement);
              setDrawerOpen(true);
            }}
          />
        )}
      />

      {page.announcements.length > 0 ? (
        <CursorPagination
          previousCursor={cursorHistory.length > 1 ? "previous" : null}
          nextCursor={page.nextCursor}
          onPrevious={() => {
            const history = cursorHistory.slice(0, -1);
            loadPage(filters, history.at(-1) ?? null, history);
          }}
          onNext={(cursor) => {
            const history = [...cursorHistory, cursor];
            loadPage(filters, cursor, history);
          }}
          pageLabel={`Showing ${page.announcements.length} announcement${page.announcements.length === 1 ? "" : "s"}`}
          loading={isPending}
        />
      ) : null}

      {editorOpen ? (
        <AnnouncementEditorDialog
          open
          announcement={editing}
          busy={mutation === "save"}
          onOpenChange={(open) => {
            if (!mutation) setEditorOpen(open);
          }}
          onSubmit={(draft) => runMutation(
            "save",
            () => editing
              ? updateAnnouncementAction({announcementId: editing.id, ...draft})
              : createAnnouncementAction(draft),
            editing ? "Draft updated." : "Announcement draft created.",
          )}
        />
      ) : null}

      <DetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title={selected?.title ?? "Announcement details"}
        description="Review publication content, audience, lifecycle, and trusted administrative metadata."
        footer={selected ? (
          <div className="grid w-full gap-2 sm:grid-cols-2">
            {selected.status === "draft" ? (
              <Button variant="secondary" onClick={openEdit}>
                <FilePenLine aria-hidden="true" />
                Edit draft
              </Button>
            ) : null}
            {selected.status === "draft" || selected.status === "scheduled" ? (
              <Button onClick={() => setPublishOpen(true)}>
                <Radio aria-hidden="true" />
                Publish
              </Button>
            ) : null}
            {selected.status !== "archived" ? (
              <Button
                variant="destructive"
                onClick={() => setArchiveOpen(true)}
                className="sm:col-span-2"
              >
                <Archive aria-hidden="true" />
                Archive
              </Button>
            ) : null}
          </div>
        ) : undefined}
      >
        {selected ? <AnnouncementDetails announcement={selected} /> : null}
      </DetailDrawer>

      {selected ? (
        <>
          <ConfirmationDialog
            open={publishOpen}
            onOpenChange={setPublishOpen}
            title="Publish this announcement?"
            description={`This will immediately make “${selected.title}” visible to ${audienceLabel(selected.audience).toLocaleLowerCase("en-PH")}. Published content cannot be edited.`}
            confirmLabel="Publish announcement"
            loadingLabel="Publishing"
            loading={mutation === "publish"}
            onConfirm={() => runMutation(
              "publish",
              () => publishAnnouncementAction({
                announcementId: selected.id,
                confirmed: true,
              }),
              "Announcement published.",
            )}
          />
          <ConfirmationDialog
            open={archiveOpen}
            onOpenChange={setArchiveOpen}
            title="Archive this announcement?"
            description="Archived announcements remain in the immutable audit trail and cannot be edited or republished."
            destructive
            confirmLabel="Archive announcement"
            loadingLabel="Archiving"
            loading={mutation === "archive"}
            confirmDisabled={archiveReason.trim().length < 10}
            onConfirm={() => runMutation(
              "archive",
              () => archiveAnnouncementAction({
                announcementId: selected.id,
                reason: archiveReason,
              }),
              "Announcement archived.",
            )}
          >
            <FormField
              label="Archive reason"
              description="Use 10–500 characters. This reason is retained in the audit log."
              required
            >
              <Textarea
                value={archiveReason}
                minLength={10}
                maxLength={500}
                disabled={Boolean(mutation)}
                onChange={(event) => setArchiveReason(event.currentTarget.value)}
              />
            </FormField>
          </ConfirmationDialog>
        </>
      ) : null}
    </div>
  );
}

function AnnouncementEditorDialog({
  open,
  announcement,
  busy,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  announcement: AdminAnnouncement | null;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: AnnouncementDraftInput) => Promise<unknown>;
}) {
  const initial = announcement ? {
    title: announcement.title,
    content: announcement.content,
    audience: announcement.audience,
    adminNotes: announcement.adminNotes,
  } : EMPTY_DRAFT;
  const [draft, setDraft] = useState(initial);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(draft);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-4xl overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{announcement ? "Edit announcement draft" : "Create announcement"}</DialogTitle>
          <DialogDescription>
            Save a private draft. Publication always requires a separate confirmation.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
          <FormField label="Title" required>
            <Input
              value={draft.title}
              minLength={5}
              maxLength={120}
              disabled={busy}
              autoFocus
              onChange={(event) => setDraft({...draft, title: event.currentTarget.value})}
            />
          </FormField>
          <FormField
            label="Announcement content"
            description="Use 20–5,000 characters of recipient-facing content."
            required
          >
            <Textarea
              value={draft.content}
              minLength={20}
              maxLength={5_000}
              disabled={busy}
              onChange={(event) => setDraft({...draft, content: event.currentTarget.value})}
            />
          </FormField>
          <FormField label="Audience" required>
            <Select
              value={draft.audience}
              disabled={busy}
              onChange={(event) => setDraft({
                ...draft,
                audience: event.currentTarget.value as AnnouncementDraftInput["audience"],
              })}
            >
              <option value="everyone">Everyone</option>
              <option value="customers">Customers</option>
              <option value="providers">Providers</option>
              <option value="admins">Administrators</option>
            </Select>
          </FormField>
          <FormField
            label="Private administrative notes"
            description="Visible only in this admin module; never stored in recipient-visible announcement data."
          >
            <Textarea
              value={draft.adminNotes}
              maxLength={1_000}
              disabled={busy}
              onChange={(event) => setDraft({...draft, adminNotes: event.currentTarget.value})}
            />
          </FormField>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={busy} loadingLabel="Saving draft">
              Save draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AnnouncementDetails({announcement}: {announcement: AdminAnnouncement}) {
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={announcement.status} />
        <Badge tone="info">{audienceLabel(announcement.audience)}</Badge>
      </div>
      <section aria-labelledby="announcement-content-heading" className="grid gap-2">
        <h3 id="announcement-content-heading" className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Recipient-facing content
        </h3>
        <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
          {announcement.content}
        </p>
      </section>
      <dl className="grid gap-4 rounded-card border border-border bg-muted/40 p-4 text-sm">
        <Detail label="Announcement ID" value={announcement.id} />
        <Detail label="Created" value={formatDate(announcement.createdAt)} />
        <Detail label="Created by" value={announcement.createdBy ?? "Unavailable"} />
        <Detail label="Last updated" value={formatDate(announcement.updatedAt)} />
        {announcement.publishedAt ? (
          <Detail label="Published" value={`${formatDate(announcement.publishedAt)} by ${announcement.publishedBy ?? "Unavailable"}`} />
        ) : null}
        {announcement.archivedAt ? (
          <Detail label="Archived" value={`${formatDate(announcement.archivedAt)} by ${announcement.archivedBy ?? "Unavailable"}`} />
        ) : null}
        {announcement.archiveReason ? (
          <Detail label="Archive reason" value={announcement.archiveReason} />
        ) : null}
      </dl>
      <section aria-labelledby="private-notes-heading" className="grid gap-2 rounded-card border border-border p-4">
        <h3 id="private-notes-heading" className="font-bold">Private administrative notes</h3>
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
          {announcement.adminNotes || "No private notes recorded."}
        </p>
      </section>
      {announcement.status === "archived" ? (
        <p className="rounded-card border border-warning bg-warning-subtle p-4 text-sm font-semibold text-warning">
          This announcement is archived and cannot be edited or republished.
        </p>
      ) : null}
    </div>
  );
}

function AnnouncementMobileCard({
  announcement,
  onView,
}: {
  announcement: AdminAnnouncement;
  onView: () => void;
}) {
  return (
    <article className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="min-w-0 flex-1 break-words font-bold">{announcement.title}</h2>
        <StatusBadge status={announcement.status} />
      </div>
      <p className="line-clamp-3 text-sm text-muted-foreground">{announcement.content}</p>
      <p className="text-sm">
        <span className="font-bold">Audience:</span> {audienceLabel(announcement.audience)}
      </p>
      <Button variant="secondary" size="compact" onClick={onView}>
        <Eye aria-hidden="true" />
        View details
      </Button>
    </article>
  );
}

function StatusBadge({status}: {status: AdminAnnouncement["status"]}) {
  const tones: Record<
    AdminAnnouncement["status"],
    NonNullable<BadgeProps["tone"]>
  > = {
    draft: "neutral",
    scheduled: "info",
    published: "success",
    expired: "warning",
    archived: "warning",
  };
  return <Badge tone={tones[status]}>{capitalize(status)}</Badge>;
}

function Detail({label, value}: {label: string; value: string}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-3">
      <dt className="font-bold">{label}</dt>
      <dd className="break-words text-muted-foreground">{value}</dd>
    </div>
  );
}

function filterLabels(filters: AdminAnnouncementFilters): string[] {
  const labels: string[] = [];
  if (filters.search) labels.push(`search “${filters.search}”`);
  if (filters.status !== "all") labels.push(`status ${filters.status}`);
  if (filters.audience !== "all") labels.push(`audience ${filters.audience}`);
  return labels;
}

function audienceLabel(audience: AdminAnnouncement["audience"]): string {
  return {
    everyone: "Everyone",
    customers: "Customers",
    providers: "Providers",
    admins: "Administrators",
  }[audience];
}

function formatDate(value: string | null): string {
  if (!value) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(date);
}

function capitalize(value: string): string {
  return `${value.charAt(0).toLocaleUpperCase("en-PH")}${value.slice(1)}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "The announcement operation could not be completed.";
}

export {AnnouncementManagementClient};
