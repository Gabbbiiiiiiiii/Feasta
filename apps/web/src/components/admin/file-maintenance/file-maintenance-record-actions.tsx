"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Download,
  Eye,
  History,
  MoreHorizontal,
  Pencil,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";

import {Button} from "@/components/ui/button";

export type FileMaintenanceLifecycleAction =
  | "discontinue"
  | "reactivate"
  | "delete";

export type FileMaintenanceOverflowAction = {
  label: string;
  icon: "view" | "history" | "download" | "delete";
  href?: string;
  onSelect?: () => void;
};

type FileMaintenanceRecordActionsProps = {
  status?: "active" | "discontinued";
  disabled?: boolean;
  showEdit?: boolean;
  menuLabel?: string;
  triggerSize?: "compact" | "icon";
  overflowActions?: readonly FileMaintenanceOverflowAction[];
  onEdit: () => void;
  onAction?: (
    action: FileMaintenanceLifecycleAction,
  ) => void;
};

const menuItemClassName = `
  flex cursor-pointer select-none items-center
  gap-2 rounded-md px-3 py-2 text-sm
  outline-none
  hover:bg-muted
  focus:bg-muted
`;

const overflowIcons = {
  view: Eye,
  history: History,
  download: Download,
  delete: Trash2,
} as const;

export function FileMaintenanceRecordActions({
  status,
  disabled = false,
  showEdit = true,
  menuLabel = "More actions",
  triggerSize = "compact",
  overflowActions = [],
  onEdit,
  onAction,
}: FileMaintenanceRecordActionsProps) {
  const handleAction = (
    action: FileMaintenanceLifecycleAction,
  ) => {
    window.setTimeout(() => {
      onAction?.(action);
    }, 0);
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {showEdit ? (
        <Button
          type="button"
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
      ) : null}

      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <Button
            type="button"
            variant="secondary"
            size={triggerSize}
            disabled={disabled}
            aria-label={menuLabel}
            title={menuLabel}
          >
            <MoreHorizontal
              aria-hidden="true"
              className="size-5"
            />
          </Button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
            }}
            className="
              z-50 min-w-44 overflow-hidden rounded-lg
              border border-border bg-background p-1
              shadow-lg
            "
          >
            {overflowActions.map((action) => {
              const Icon = overflowIcons[action.icon];
              const icon = (
                <Icon
                  aria-hidden="true"
                  className="size-4"
                />
              );
              if (action.href) {
                return (
                  <DropdownMenu.Item
                    key={action.label}
                    asChild
                  >
                    <a
                      href={action.href}
                      className={menuItemClassName}
                    >
                      {icon}
                      {action.label}
                    </a>
                  </DropdownMenu.Item>
                );
              }
              return (
                <DropdownMenu.Item
                  key={action.label}
                  className={menuItemClassName}
                  onSelect={() => {
                    window.setTimeout(() => {
                      action.onSelect?.();
                    }, 0);
                  }}
                >
                  {icon}
                  {action.label}
                </DropdownMenu.Item>
              );
            })}
            {status === undefined ? null : status === "active" ? (
              <DropdownMenu.Item
                className={menuItemClassName}
                onSelect={() =>
                  handleAction("discontinue")
                }
              >
                <PowerOff
                  aria-hidden="true"
                  className="size-4"
                />
                Discontinue
              </DropdownMenu.Item>
            ) : (
              <>
                <DropdownMenu.Item
                  className={menuItemClassName}
                  onSelect={() =>
                    handleAction("reactivate")
                  }
                >
                  <Power
                    aria-hidden="true"
                    className="size-4"
                  />
                  Reactivate
                </DropdownMenu.Item>

                <DropdownMenu.Separator
                  className="my-1 h-px bg-border"
                />

                <DropdownMenu.Item
                  className="
                    flex cursor-pointer select-none items-center
                    gap-2 rounded-md px-3 py-2 text-sm
                    text-destructive outline-none
                    hover:bg-destructive/10
                    focus:bg-destructive/10
                  "
                  onSelect={() =>
                    handleAction("delete")
                  }
                >
                  <Trash2
                    aria-hidden="true"
                    className="size-4"
                  />
                  Delete
                </DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  );
}
