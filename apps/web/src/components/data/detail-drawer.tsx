"use client";

import {ArrowLeft, Printer} from "lucide-react";
import {useCallback, useEffect, useRef, type ReactNode} from "react";

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

type DetailDrawerProps = {
  title: string;
  description: string;
  children: ReactNode;
  trigger?: ReactNode;
  headerMeta?: ReactNode;
  footer?: ReactNode;
  footerMeta?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  fullScreen?: boolean;
  backLabel?: string;
  printable?: boolean;
  printLabel?: string;
  onPrint?: () => void;
};

function DetailDrawer({
  title,
  description,
  children,
  trigger,
  headerMeta,
  footer,
  footerMeta,
  open,
  onOpenChange,
  fullScreen = false,
  backLabel = "Back",
  printable = false,
  printLabel = "Print",
  onPrint,
}: DetailDrawerProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  const expandDetailsForPrint = useCallback(() => {
    const container = bodyRef.current;
    if (!container) return;
    for (const element of container.querySelectorAll("details")) {
      if (!element.hasAttribute("open")) {
        element.setAttribute("open", "");
        element.setAttribute("data-print-opened", "true");
      }
    }
  }, []);

  const restoreDetailsAfterPrint = useCallback(() => {
    const container = bodyRef.current;
    if (!container) return;
    for (const element of container.querySelectorAll("details[data-print-opened='true']")) {
      element.removeAttribute("open");
      element.removeAttribute("data-print-opened");
    }
  }, []);

  useEffect(() => {
    if (!printable || open === false) return;
    window.addEventListener("beforeprint", expandDetailsForPrint);
    window.addEventListener("afterprint", restoreDetailsAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", expandDetailsForPrint);
      window.removeEventListener("afterprint", restoreDetailsAfterPrint);
      restoreDetailsAfterPrint();
    };
  }, [printable, open, expandDetailsForPrint, restoreDetailsAfterPrint]);

  const handlePrint = () => {
    if (onPrint) {
      onPrint();
      return;
    }
    expandDetailsForPrint();
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        showCloseButton={!fullScreen}
        overlayClassName={fullScreen ? "bg-background" : undefined}
        data-printable-detail-drawer={printable ? "true" : undefined}
        className={
          fullScreen
            ? "inset-0 left-0 right-0 top-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 shadow-none transition-opacity duration-200 ease-out data-[state=closed]:opacity-0 data-[state=open]:opacity-100"
            : "inset-y-0 right-0 left-auto top-0 h-dvh max-h-dvh w-[min(100vw,32rem)] max-w-[100vw] translate-x-0 translate-y-0 content-start overflow-x-hidden rounded-none border-y-0 border-r-0 p-0 transition-[transform,opacity] duration-200 ease-out data-[state=closed]:translate-x-4 data-[state=closed]:opacity-0 data-[state=open]:translate-x-0 data-[state=open]:opacity-100 sm:rounded-l-dialog"
        }
      >
        <DialogHeader
          data-printable-detail-header={printable ? "true" : undefined}
          className={
            fullScreen
              ? "shrink-0 border-b border-border bg-card p-0"
              : "border-b border-border p-4 pr-16 sm:p-6 sm:pr-16"
          }
        >
          <div
            className={
              fullScreen
                ? "mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6"
                : "flex items-start justify-between gap-3"
            }
          >
            <div className={fullScreen ? "flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2" : "grid min-w-0 gap-1"}>
              {printable ? (
                <p className="hidden w-full text-[10px] font-bold uppercase tracking-widest text-primary print:block">
                  FEASTA · Provider Review Sheet
                </p>
              ) : null}
              <DialogTitle className={fullScreen ? "text-lg font-bold tracking-tight sm:text-xl" : undefined}>
                {title}
              </DialogTitle>
              {headerMeta ? (
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {headerMeta}
                </div>
              ) : null}
              <DialogDescription
                className={
                  headerMeta
                    ? "sr-only"
                    : fullScreen
                      ? "w-full text-sm text-muted-foreground"
                      : undefined
                }
              >
                {description}
              </DialogDescription>
            </div>
            {printable ? (
              <div className="flex shrink-0 items-center gap-2 print:hidden" data-print-hidden="">
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  className="min-h-9 rounded-lg px-3 text-sm font-medium shadow-none"
                  onClick={handlePrint}
                >
                  <Printer aria-hidden="true" className="size-4" />
                  {printLabel}
                </Button>
              </div>
            ) : null}
          </div>
        </DialogHeader>
        <div
          ref={bodyRef}
          data-printable-detail-body={printable ? "true" : undefined}
          className={
            fullScreen
              ? "min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-background px-4 py-5 sm:px-6 sm:py-6"
              : "min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6"
          }
        >
          {fullScreen ? (
            <div className="mx-auto w-full max-w-6xl">
              <div data-print-hidden="" className="mb-4 flex print:hidden">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    className="rounded-full px-3.5 text-sm font-medium shadow-none"
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    {backLabel}
                  </Button>
                </DialogClose>
              </div>
              {children}
            </div>
          ) : (
            children
          )}
        </div>
        {footer || footerMeta ? (
          <DialogFooter
            data-printable-detail-footer={printable ? "true" : undefined}
            className={
              fullScreen
                ? "mt-auto shrink-0 border-t border-border bg-card px-4 py-3.5 sm:px-6 print:hidden"
                : "mt-auto border-t border-border p-4 print:hidden"
            }
          >
            {fullScreen ? (
              <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-xs text-muted-foreground">{footerMeta}</div>
                {footer ? (
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                    {footer}
                  </div>
                ) : null}
              </div>
            ) : (
              footer
            )}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export {DetailDrawer, type DetailDrawerProps};
