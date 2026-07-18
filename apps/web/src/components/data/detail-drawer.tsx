"use client";

import type {ReactNode} from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type DetailDrawerProps = {
  title: string;
  description: string;
  children: ReactNode;
  trigger?: ReactNode;
  footer?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

function DetailDrawer({
  title,
  description,
  children,
  trigger,
  footer,
  open,
  onOpenChange,
}: DetailDrawerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="inset-y-0 right-0 left-auto top-0 h-dvh max-h-dvh w-[min(100vw,32rem)] max-w-[100vw] translate-x-0 translate-y-0 content-start overflow-x-hidden rounded-none sm:rounded-l-dialog border-y-0 border-r-0 p-0">
        <DialogHeader className="border-b border-border p-4 pr-16 sm:p-6 sm:pr-16">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">{children}</div>
        {footer ? <DialogFooter className="mt-auto border-t border-border p-4">{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

export {DetailDrawer, type DetailDrawerProps};
