import Link from "next/link";
import {redirect} from "next/navigation";

import {AuthCard} from "@/components/auth/auth-card";
import {AuthStatus} from "@/components/auth/auth-status";
import {Button} from "@/components/ui/button";

import {ActionProcessor} from "./action-processor";

export default async function AuthenticationActionPage({
  searchParams,
}: {
  searchParams: Promise<{mode?: string; oobCode?: string}>;
}) {
  const {mode, oobCode} = await searchParams;
  if (mode === "resetPassword" && oobCode) {
    redirect(`/reset-password?oobCode=${encodeURIComponent(oobCode)}`);
  }
  if ((mode === "verifyEmail" || mode === "recoverEmail") && oobCode) {
    return <ActionProcessor mode={mode} code={oobCode} />;
  }
  return (
    <AuthCard title="FEASTA account action" description="This account action link cannot be completed.">
      <div className="grid gap-4">
        <AuthStatus
          message="This link is incomplete, invalid, or unsupported."
          tone="error"
        />
        <Button asChild variant="secondary"><Link href="/login">Return to sign in</Link></Button>
      </div>
    </AuthCard>
  );
}
