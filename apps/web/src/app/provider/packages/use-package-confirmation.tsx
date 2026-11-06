"use client";
import {useRef, useState} from "react";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
type Request = {message: string; supportingText?: string; confirmLabel: string};
export function usePackageConfirmation() {
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  function confirm(request: Request): Promise<boolean> {
    if (resolver.current) return Promise.resolve(false);
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return new Promise((resolve) => {resolver.current = resolve; setRequest(request);});
  }
  function finish(confirmed: boolean) {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(confirmed);
  }
  const confirmationDialog = <ConfirmationDialog open={request !== null}
    onOpenChange={(open) => {if (!open) finish(false);}}
    title="FEASTA Confirmation" description={request?.message ?? "Confirm package action"}
    confirmLabel={request?.confirmLabel} onConfirm={() => finish(true)}
    contentClassName="z-[90]" overlayClassName="z-[80]" stopEscapePropagation
    onCloseAutoFocus={(event) => {event.preventDefault(); opener.current?.focus();}}>
    {request?.supportingText ? <p className="text-sm text-muted-foreground">{request.supportingText}</p> : null}
  </ConfirmationDialog>;
  return {confirm, confirmationDialog};
}
