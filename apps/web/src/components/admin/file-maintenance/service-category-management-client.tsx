"use client";

import {
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import {
  useMemo,
  useState,
  useTransition,
  type FormEvent,
} from "react";

import {DataTable, type DataTableColumn} from "@/components/data/data-table";
import {FilterToolbar} from "@/components/data/filter-toolbar";
import {feastaToast} from "@/components/feedback/toast";
import {FormField} from "@/components/forms/form-field";
import {PageHeading} from "@/components/layout/page-heading";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {Badge} from "@/components/ui/badge";
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
import {
  createAdminServiceCategory,
  deleteAdminServiceCategory,
  discontinueAdminServiceCategory,
  reactivateAdminServiceCategory,
  updateAdminServiceCategory,
} from "@/lib/admin/file-maintenance/admin-service-category-client";
import type {
  AdminServiceCategory,
  AdminServiceCategoryServiceType,
  AdminServiceCategoryStatus,
} from "@/lib/admin/file-maintenance/admin-service-category-types";

type Props = {
  initialCategories: AdminServiceCategory[];
};

type StatusFilter =
  "all" | AdminServiceCategoryStatus;

type ServiceTypeFilter =
  "all" | AdminServiceCategoryServiceType;

type EditorDraft = {
  name: string;
  serviceType: AdminServiceCategoryServiceType;
};

const EMPTY_DRAFT: EditorDraft = {
  name: "",
  serviceType: "addon",
};

function ServiceCategoryManagementClient({
  initialCategories,
}: Props) {
  const [categories, setCategories] =
    useState(initialCategories);
  const [searchValue, setSearchValue] =
    useState("");
  const [search, setSearch] =
    useState("");
  const [status, setStatus] =
    useState<StatusFilter>("all");
  const [serviceType, setServiceType] =
    useState<ServiceTypeFilter>("all");

  const [editorOpen, setEditorOpen] =
    useState(false);
  const [editing, setEditing] =
    useState<AdminServiceCategory | null>(null);
  const [draft, setDraft] =
    useState<EditorDraft>(EMPTY_DRAFT);
  const [formError, setFormError] =
    useState<string>();

  const [confirmCategory, setConfirmCategory] =
    useState<AdminServiceCategory | null>(null);
  const [confirmAction, setConfirmAction] =
    useState<
      "discontinue" |
      "reactivate" |
      "delete" |
      null
    >(null);

  const [isPending, startTransition] =
    useTransition();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return categories
      .filter((category) => {
        if (
          status !== "all" &&
          category.status !== status
        ) {
          return false;
        }

        if (
          serviceType !== "all" &&
          category.serviceType !== serviceType
        ) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [
          category.name,
          category.code,
          serviceTypeLabel(category.serviceType),
        ].some((value) =>
          value.toLowerCase().includes(query),
        );
      })
      .sort((left, right) =>
        left.name.localeCompare(
          right.name,
          undefined,
          {sensitivity: "base"},
        ),
      );
  }, [
    categories,
    search,
    serviceType,
    status,
  ]);

  const activeFilters = [
    ...(status !== "all"
      ? [`Status: ${statusLabel(status)}`]
      : []),
    ...(serviceType !== "all"
      ? [
          `Service type: ${
            serviceTypeLabel(serviceType)
          }`,
        ]
      : []),
  ];

  const columns =
    useMemo<
      DataTableColumn<AdminServiceCategory>[]
    >(
      () => [
        {
          id: "name",
          header: "Service category",
          cell: (category) => (
            <div className="min-w-0">
              <p className="break-words font-bold">
                {category.name}
              </p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {category.code}
              </p>
            </div>
          ),
        },
        {
          id: "serviceType",
          header: "Service type",
          cell: (category) =>
            serviceTypeLabel(
              category.serviceType,
            ),
        },
        {
          id: "status",
          header: "Status",
          cell: (category) => (
            <Badge
              tone={
                category.status === "active"
                  ? "success"
                  : "warning"
              }
            >
              {statusLabel(category.status)}
            </Badge>
          ),
        },
      ],
      [],
    );

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setFormError(undefined);
    setEditorOpen(true);
  };

  const openEdit = (
    category: AdminServiceCategory,
  ) => {
    setEditing(category);
    setDraft({
      name: category.name,
      serviceType: category.serviceType,
    });
    setFormError(undefined);
    setEditorOpen(true);
  };

  const saveEditor = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const name =
      draft.name.trim().replace(/\s+/g, " ");

    if (name.length < 2 || name.length > 100) {
      setFormError(
        "Enter a service category name between 2 and 100 characters.",
      );
      return;
    }

    setFormError(undefined);

    startTransition(async () => {
      try {
        if (editing) {
          await updateAdminServiceCategory({
            code: editing.code,
            name,
            serviceType: draft.serviceType,
          });

          setCategories((current) =>
            current.map((category) =>
              category.code === editing.code
                ? {
                    ...category,
                    name,
                    serviceType:
                      draft.serviceType,
                    sortName:
                      name.toLowerCase(),
                  }
                : category,
            ),
          );

          feastaToast.success(
            "Service category updated.",
          );
        } else {
          const code =
            normalizeServiceCategoryCode(name);

          if (!code) {
            setFormError(
              "Enter a name that can generate a valid service category code.",
            );
            return;
          }

          const result =
            await createAdminServiceCategory({
              code,
              name,
              serviceType: draft.serviceType,
            });

          const created =
            result.category ?? {
              code,
              name,
              serviceType:
                draft.serviceType,
              status: "active" as const,
              sortName:
                name.toLowerCase(),
            };

          setCategories((current) => [
            ...current,
            created,
          ]);

          feastaToast.success(
            "Service category added.",
          );
        }

        setEditorOpen(false);
        setEditing(null);
        setDraft(EMPTY_DRAFT);
      } catch (error: unknown) {
        setFormError(errorMessage(error));
      }
    });
  };

  const runConfirmedAction = async () => {
    if (!confirmCategory || !confirmAction) {
      return;
    }

    const category = confirmCategory;

    try {
      if (confirmAction === "discontinue") {
        await discontinueAdminServiceCategory(
          category.code,
        );

        setCategories((current) =>
          current.map((item) =>
            item.code === category.code
              ? {
                  ...item,
                  status:
                    "discontinued" as const,
                }
              : item,
          ),
        );

        feastaToast.success(
          "Service category discontinued.",
        );
      } else if (
        confirmAction === "reactivate"
      ) {
        await reactivateAdminServiceCategory(
          category.code,
        );

        setCategories((current) =>
          current.map((item) =>
            item.code === category.code
              ? {
                  ...item,
                  status: "active" as const,
                }
              : item,
          ),
        );

        feastaToast.success(
          "Service category reactivated.",
        );
      } else {
        await deleteAdminServiceCategory(
          category.code,
        );

        setCategories((current) =>
          current.filter(
            (item) =>
              item.code !== category.code,
          ),
        );

        feastaToast.success(
          "Service category deleted.",
        );
      }

      setConfirmCategory(null);
      setConfirmAction(null);
    } catch (error: unknown) {
      feastaToast.error(errorMessage(error));
    }
  };

  return (
    <div className="grid min-w-0 gap-6">
      <PageHeading
        eyebrow="File Maintenance"
        title="Service Categories"
        description="Manage the service categories providers can select across FEASTA. Discontinued categories remain available for existing records but cannot be newly selected."
        actions={
          <Button onClick={openCreate}>
            <Plus
              aria-hidden="true"
              className="size-5"
            />
            Add Service Category
          </Button>
        }
      />

      <FilterToolbar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        onSearchSubmit={setSearch}
        onClearSearch={() => {
          setSearchValue("");
          setSearch("");
        }}
        onClearFilters={() => {
          setSearchValue("");
          setSearch("");
          setStatus("all");
          setServiceType("all");
        }}
        searchLabel="Search service categories"
        searchPlaceholder="Search name or code"
        searchHint={`${filtered.length} of ${categories.length} categories shown`}
        activeFilters={activeFilters}
        filterControls={
          <>
            <FormField label="Status">
              <Select
                value={status}
                onChange={(event) =>
                  setStatus(
                    event.currentTarget
                      .value as StatusFilter,
                  )
                }
              >
                <option value="all">
                  All statuses
                </option>
                <option value="active">
                  Active
                </option>
                <option value="discontinued">
                  Discontinued
                </option>
              </Select>
            </FormField>

            <FormField label="Service type">
              <Select
                value={serviceType}
                onChange={(event) =>
                  setServiceType(
                    event.currentTarget
                      .value as ServiceTypeFilter,
                  )
                }
              >
                <option value="all">
                  All service types
                </option>
                <option value="addon">
                  Add-on
                </option>
                <option value="catering">
                  Catering
                </option>
              </Select>
            </FormField>
          </>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        getRowId={(category) =>
          category.code
        }
        caption="Service categories"
        emptyTitle="No service categories found"
        emptyDescription="No service categories match the current filters."
        rowActions={(category) => (
          <CategoryActions
            category={category}
            disabled={isPending}
            onEdit={() =>
              openEdit(category)
            }
            onAction={(action) => {
              setConfirmCategory(category);
              setConfirmAction(action);
            }}
          />
        )}
        renderMobileRow={(category) => (
          <CategoryMobileCard
            category={category}
            disabled={isPending}
            onEdit={() =>
              openEdit(category)
            }
            onAction={(action) => {
              setConfirmCategory(category);
              setConfirmAction(action);
            }}
          />
        )}
      />

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!isPending) {
            setEditorOpen(open);
          }
        }}
      >
        <DialogContent
          className="w-[calc(100vw-2rem)] max-w-xl"
          showCloseButton={!isPending}
        >
          <DialogHeader>
            <DialogTitle>
              {editing
                ? "Edit service category"
                : "Add service category"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update the display name or service type. The category code remains unchanged."
                : "Create a service category providers can select during setup and service management."}
            </DialogDescription>
          </DialogHeader>

          <form
            className="grid gap-5"
            onSubmit={saveEditor}
          >
            <FormField
              label="Category name"
              required
              error={formError}
              disabled={isPending}
              description={
                editing
                  ? `Code: ${editing.code}`
                  : draft.name.trim()
                    ? `Code: ${
                        normalizeServiceCategoryCode(
                          draft.name,
                        ) || "—"
                      }`
                    : "A permanent code will be generated from the category name."
              }
            >
              <Input
                value={draft.name}
                maxLength={100}
                autoFocus
                onChange={(event) => {
                  const value = event.currentTarget.value;

                  setDraft((current) => ({
                    ...current,
                    name: value,
                  }));
                }}
              />
            </FormField>

            <FormField
              label="Service type"
              required
              disabled={
                isPending ||
                editing?.status === "active"
              }
              description={
                editing?.status === "active"
                  ? "Discontinue this category before changing its service type."
                  : "Catering categories belong to catering providers. Add-on categories belong to other event service providers."
              }
            >
              <Select
                value={draft.serviceType}
                onChange={(event) => {
                  const serviceType =
                    event.currentTarget
                      .value as AdminServiceCategoryServiceType;

                  setDraft((current) => ({
                    ...current,
                    serviceType,
                  }));
                }}
              >
                <option value="addon">
                  Add-on
                </option>
                <option value="catering">
                  Catering
                </option>
              </Select>
            </FormField>

            <DialogFooter>
              <Button
                type="button"
                variant="secondary"
                disabled={isPending}
                onClick={() =>
                  setEditorOpen(false)
                }
              >
                Cancel
              </Button>

              <Button
                type="submit"
                loading={isPending}
                loadingLabel="Saving"
              >
                {editing
                  ? "Save Changes"
                  : "Add Category"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={
          confirmCategory !== null &&
          confirmAction !== null
        }
        onOpenChange={(open) => {
          if (!open) {
            setConfirmCategory(null);
            setConfirmAction(null);
          }
        }}
        title={confirmationTitle(
          confirmAction,
        )}
        description={confirmationDescription(
          confirmCategory,
          confirmAction,
        )}
        confirmLabel={confirmationLabel(
          confirmAction,
        )}
        destructive={
          confirmAction === "discontinue" ||
          confirmAction === "delete"
        }
        onConfirm={runConfirmedAction}
      />
    </div>
  );
}

type CategoryAction =
  "discontinue" |
  "reactivate" |
  "delete";

type CategoryActionProps = {
  category: AdminServiceCategory;
  disabled: boolean;
  onEdit: () => void;
  onAction: (
    action: CategoryAction,
  ) => void;
};

function CategoryActions({
  category,
  disabled,
  onEdit,
  onAction,
}: CategoryActionProps) {
  return (
    <div className="flex justify-end gap-1">
      <Button
        variant="ghost"
        size="compact"
        disabled={disabled}
        onClick={onEdit}
      >
        <Pencil
          aria-hidden="true"
          className="size-4"
        />
        Edit
      </Button>

      {category.status === "active" ? (
        <Button
          variant="ghost"
          size="compact"
          disabled={disabled}
          onClick={() =>
            onAction("discontinue")
          }
        >
          <PowerOff
            aria-hidden="true"
            className="size-4"
          />
          Discontinue
        </Button>
      ) : (
        <>
          <Button
            variant="ghost"
            size="compact"
            disabled={disabled}
            onClick={() =>
              onAction("reactivate")
            }
          >
            <Power
              aria-hidden="true"
              className="size-4"
            />
            Reactivate
          </Button>

          <Button
            variant="ghost"
            size="compact"
            disabled={disabled}
            onClick={() =>
              onAction("delete")
            }
          >
            <Trash2
              aria-hidden="true"
              className="size-4"
            />
            Delete
          </Button>
        </>
      )}
    </div>
  );
}

function CategoryMobileCard({
  category,
  disabled,
  onEdit,
  onAction,
}: CategoryActionProps) {
  return (
    <article className="grid gap-4 rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words font-bold">
            {category.name}
          </h2>
          <p className="mt-1 break-all text-xs text-muted-foreground">
            {category.code}
          </p>
        </div>

        <Badge
          tone={
            category.status === "active"
              ? "success"
              : "warning"
          }
        >
          {statusLabel(category.status)}
        </Badge>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Service type
        </p>
        <p className="mt-1 text-sm font-semibold">
          {serviceTypeLabel(
            category.serviceType,
          )}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="secondary"
          size="compact"
          disabled={disabled}
          onClick={onEdit}
        >
          <Pencil
            aria-hidden="true"
            className="size-4"
          />
          Edit
        </Button>

        {category.status === "active" ? (
          <Button
            variant="secondary"
            size="compact"
            disabled={disabled}
            onClick={() =>
              onAction("discontinue")
            }
          >
            <PowerOff
              aria-hidden="true"
              className="size-4"
            />
            Discontinue
          </Button>
        ) : (
          <>
            <Button
              variant="secondary"
              size="compact"
              disabled={disabled}
              onClick={() =>
                onAction("reactivate")
              }
            >
              <Power
                aria-hidden="true"
                className="size-4"
              />
              Reactivate
            </Button>

            <Button
              variant="destructive"
              size="compact"
              disabled={disabled}
              onClick={() =>
                onAction("delete")
              }
            >
              <Trash2
                aria-hidden="true"
                className="size-4"
              />
              Delete
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

function normalizeServiceCategoryCode(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "_")
    .replaceAll(/^_+|_+$/gu, "");
}

function serviceTypeLabel(
  value: AdminServiceCategoryServiceType,
): string {
  return value === "catering"
    ? "Catering"
    : "Add-on";
}

function statusLabel(
  value: AdminServiceCategoryStatus,
): string {
  return value === "active"
    ? "Active"
    : "Discontinued";
}

function confirmationTitle(
  action:
    | CategoryAction
    | null,
): string {
  switch (action) {
    case "discontinue":
      return "Discontinue service category?";
    case "reactivate":
      return "Reactivate service category?";
    case "delete":
      return "Delete service category?";
    default:
      return "Confirm service category change";
  }
}

function confirmationLabel(
  action:
    | CategoryAction
    | null,
): string {
  switch (action) {
    case "discontinue":
      return "Discontinue";
    case "reactivate":
      return "Reactivate";
    case "delete":
      return "Delete";
    default:
      return "Confirm";
  }
}

function confirmationDescription(
  category: AdminServiceCategory | null,
  action: CategoryAction | null,
): string {
  if (!category) {
    return "Confirm this service category change.";
  }

  switch (action) {
    case "discontinue":
      return `${category.name} will no longer be available for new provider selections or category changes. Existing records will remain unchanged.`;

    case "reactivate":
      return `${category.name} will become available for new provider selections again.`;

    case "delete":
      return `${category.name} will be permanently deleted. Deletion is allowed only when the category is discontinued and no current providers or services use it.`;

    default:
      return "Confirm this service category change.";
  }
}

function errorMessage(
  error: unknown,
): string {
  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "The service category change could not be completed.";
}

export {
  ServiceCategoryManagementClient,
};
