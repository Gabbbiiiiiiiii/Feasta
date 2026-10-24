"use client";

import {Toaster, toast} from "sonner";

const feastaToast = {
  success: (message: string) => toast.success(message),
  error: (message: string) => toast.error(message),
  warning: (message: string) => toast.warning(message),
  info: (message: string) => toast.info(message),
  loading: (message: string) => toast.loading(message),
  dismiss: (id?: string | number) => toast.dismiss(id),
};

function FeastaToaster() {
  return (
    <Toaster
      position="top-right"
      closeButton
      richColors
      toastOptions={{
        classNames: {
          toast: "border-border bg-card text-card-foreground shadow-floating",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-secondary text-secondary-foreground",
        },
      }}
    />
  );
}

export {FeastaToaster, feastaToast};
