"use client";

import {useRouter} from "next/navigation";
import {useState} from "react";

import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {Button} from "@/components/ui/button";
import {logoutWebSession} from "@/lib/auth/client-session";

export function LogoutButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <ConfirmationDialog
      open={open}
      onOpenChange={setOpen}
      title="Sign out of FEASTA?"
      description="You will need to sign in again to access this protected workspace."
      confirmLabel="Sign out"
      onConfirm={async () => {
        try {
          await logoutWebSession();
          router.replace("/login");
          router.refresh();
        } finally {
          setOpen(false);
        }
      }}
      trigger={<Button variant="secondary">Sign out</Button>}
    />
  );
}
