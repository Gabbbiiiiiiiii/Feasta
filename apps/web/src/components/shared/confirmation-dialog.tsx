"use client";

import * as React from "react";

import {Button} from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  cn,
} from "@/lib/utils";

type ConfirmationDialogProps = {
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;

  children?: React.ReactNode;
  trigger?: React.ReactNode;

  open?: boolean;
  onOpenChange?: (
    open: boolean,
  ) => void;

  confirmLabel?: string;
  cancelLabel?: string;

  destructive?: boolean;
  loading?: boolean;
  confirmDisabled?: boolean;
  loadingLabel?: string;
  contentClassName?: string;
  bodyClassName?: string;
};

function ConfirmationDialog({
  title,
  description,
  onConfirm,
  children,
  trigger,
  open,
  onOpenChange,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  confirmDisabled = false,
  loadingLabel = "Submitting",
  contentClassName,
  bodyClassName,
}: ConfirmationDialogProps) {
  const [pending, setPending] =
    React.useState(false);

  const isBusy = loading || pending;

  const confirm = async () => {
    if (
      isBusy ||
      confirmDisabled
    ) {
      return;
    }

    setPending(true);

    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isBusy) {
          onOpenChange?.(next);
        }
      }}
    >
      {trigger ? (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      ) : null}

      <DialogContent
        className={contentClassName}
        showCloseButton={!isBusy}
        onEscapeKeyDown={(event) => {
          if (isBusy) {
            event.preventDefault();
          }
        }}
        onPointerDownOutside={(
          event,
        ) => {
          if (isBusy) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {title}
          </DialogTitle>

          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        {children ? (
          <div
            className={cn(
              "min-h-0 min-w-0",
              bodyClassName,
            )}
          >
            {children}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            disabled={isBusy}
            onClick={() =>
              onOpenChange?.(false)
            }
          >
            {cancelLabel}
          </Button>

          <Button
            type="button"
            variant={
              destructive
                ? "destructive"
                : "primary"
            }
            loading={isBusy}
            loadingLabel={loadingLabel}
            disabled={confirmDisabled}
            onClick={() =>
              void confirm()
            }
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export {
  ConfirmationDialog,
  type ConfirmationDialogProps,
};