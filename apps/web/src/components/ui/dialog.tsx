"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import {X} from "lucide-react";
import * as React from "react";

import {cn} from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({className, ...props}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn("fixed inset-0 z-50 bg-overlay transition-opacity duration-fast data-[state=closed]:opacity-0 data-[state=open]:opacity-100", className)}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {showCloseButton?: boolean}) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid max-h-[min(90vh,48rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-dialog border border-border bg-card p-6 text-card-foreground shadow-modal focus:outline-none",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close
            className="absolute right-3 top-3 inline-flex size-12 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close dialog"
          >
            <X aria-hidden="true" className="size-5" />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({className, ...props}: React.ComponentProps<"div">) {
  return <div className={cn("grid gap-2 pr-10 text-left", className)} {...props} />;
}

function DialogFooter({className, ...props}: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-3 sm:flex-row sm:justify-end", className)} {...props} />;
}

function DialogTitle({className, ...props}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("text-xl font-bold leading-tight", className)} {...props} />;
}

function DialogDescription({className, ...props}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("text-base text-muted-foreground", className)} {...props} />;
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
