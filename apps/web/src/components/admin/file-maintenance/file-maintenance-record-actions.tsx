"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
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

type FileMaintenanceRecordActionsProps = {
  status: "active" | "discontinued";
  disabled?: boolean;
  onEdit: () => void;
  onAction: (
    action: FileMaintenanceLifecycleAction,
  ) => void;
};

export function FileMaintenanceRecordActions({
  status,
  disabled = false,
  onEdit,
  onAction,
}: FileMaintenanceRecordActionsProps) {
  const handleAction = (
    action: FileMaintenanceLifecycleAction,
  ) => {
    window.setTimeout(() => {
      onAction(action);
    }, 0);
  };

  return (
    <div className="flex items-center justify-end gap-2">
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

      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            disabled={disabled}
            aria-label="More actions"
            title="More actions"
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
            {status === "active" ? (
              <DropdownMenu.Item
                className="
                  flex cursor-pointer select-none items-center
                  gap-2 rounded-md px-3 py-2 text-sm
                  outline-none
                  hover:bg-muted
                  focus:bg-muted
                "
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
                  className="
                    flex cursor-pointer select-none items-center
                    gap-2 rounded-md px-3 py-2 text-sm
                    outline-none
                    hover:bg-muted
                    focus:bg-muted
                  "
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