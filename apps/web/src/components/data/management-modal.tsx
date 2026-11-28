"use client";

import {useState, type FormEvent, type ReactNode} from "react";

import {ConfirmationDialog, type ConfirmationDialogProps} from "@/components/shared/confirmation-dialog";
import {Button} from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type ManagementModalProps = {
  title: string;
  description: string;
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  submitLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  error?: string;
};

function ManagementModal({
  title,
  description,
  children,
  onSubmit,
  trigger,
  open,
  onOpenChange,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  loading = false,
  error,
}: ManagementModalProps) {
  const [pending, setPending] = useState(false);
  const isBusy = loading || pending;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isBusy) return;
    setPending(true);
    try {
      await onSubmit();
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !isBusy && onOpenChange?.(next)}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        showCloseButton={!isBusy}
        onEscapeKeyDown={(event) => isBusy && event.preventDefault()}
        onPointerDownOutside={(event) => isBusy && event.preventDefault()}
      >
        <form onSubmit={submit} className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">{children}</div>
          {error ? <p role="alert" className="rounded-md bg-destructive-subtle p-3 text-sm font-semibold text-destructive">{error}</p> : null}
          <DialogFooter>
            <DialogClose asChild disabled={isBusy}>
              <Button variant="secondary" disabled={isBusy}>{cancelLabel}</Button>
            </DialogClose>
            <Button type="submit" loading={isBusy} loadingLabel="Saving">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ManagementConfirmationModal(props: ConfirmationDialogProps) {
  return <ConfirmationDialog {...props} />;
}

export {
  ManagementConfirmationModal,
  ManagementModal,
  type ManagementModalProps,
};
