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
  stackedActions?: boolean;
  onDiscard?: () => void;
  loading?: boolean;
  confirmDisabled?: boolean;
  loadingLabel?: string;
  contentClassName?: string;
  bodyClassName?: string;
  restoreFocusId?: string;
  overlayClassName?: string;
  error?: string | null;
  onCloseAutoFocus?: React.ComponentProps<typeof DialogContent>["onCloseAutoFocus"];
  stopEscapePropagation?: boolean;
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
  stackedActions = false,
  onDiscard,
  loading = false,
  confirmDisabled = false,
  loadingLabel = "Submitting",
  contentClassName,
  bodyClassName,
  restoreFocusId,
  overlayClassName,
  error = null,
  onCloseAutoFocus,
  stopEscapePropagation = false,
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

  const cancelButton = (
    <Button
      type="button"
      variant={stackedActions ? "ghost" : "secondary"}
      className={stackedActions ? "order-3 w-full rounded-full" : undefined}
      disabled={isBusy}
      onClick={() =>
        onOpenChange?.(false)
      }
    >
      {cancelLabel}
    </Button>
  );

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
        overlayClassName={overlayClassName}
        showCloseButton={!isBusy && !stackedActions}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented) return;
          const target = restoreFocusId
            ? document.getElementById(restoreFocusId)
            : null;
          if (target instanceof HTMLElement) {
            event.preventDefault();
            target.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (stopEscapePropagation) event.stopPropagation();
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

        {error ? (
          <div
            className="rounded-xl border border-destructive/30 bg-destructive-subtle p-3"
            role="alert"
          >
            <p className="text-sm font-bold text-destructive">
              Action could not be completed
            </p>
            <p className="mt-1 text-sm text-destructive">
              {error}
            </p>
          </div>
        ) : null}

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

        <DialogFooter className={stackedActions ? "flex flex-col gap-3 sm:flex-col" : undefined}>
          {!stackedActions && cancelButton}
          <Button
            type="button"
            className={stackedActions ? "order-1 w-full rounded-full" : undefined}
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
          {onDiscard ? (
            <Button type="button" variant="secondary"
              className="order-2 w-full rounded-full"
              disabled={isBusy} onClick={onDiscard}>
              Discard changes
            </Button>
          ) : null}
          {stackedActions && cancelButton}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export {
  ConfirmationDialog,
  type ConfirmationDialogProps,
};
