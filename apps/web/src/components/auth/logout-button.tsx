"use client";

import {useRouter} from "next/navigation";
import {useState} from "react";

import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {Button} from "@/components/ui/button";
import {logoutWebSession} from "@/lib/auth/client-session";

export function LogoutButton({
  destination = "/customer/providers",
}: {
  destination?: "/customer/providers" | "/provider-login" | "/admin-login";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={(next) => {setOpen(next); setError(null);}}
      title="Sign out of FEASTA?"
      description="You will need to sign in again to access this protected workspace."
      confirmLabel="Sign out"
      onConfirm={async () => {
        setError(null);
        try {
          await logoutWebSession();
          router.replace(destination);
          router.refresh();
          setOpen(false);
        } catch {
          setError("Sign out could not be completed. Please try again.");
        }
      }}
      trigger={<Button variant="secondary">Sign out</Button>}
    >
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </ConfirmationDialog>
  );
}
