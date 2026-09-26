import {LogoutButton} from "@/components/auth/logout-button";
import {PageHeading} from "@/components/layout/page-heading";
import {requireRole, type UserRole} from "@/lib/auth/session";

export async function RoleHome({role}: {role: UserRole}) {
  const user = await requireRole([role]);
  return (
    <div className="grid gap-8">
      <PageHeading
        eyebrow={`${role} session`}
        title="Authenticated FEASTA access"
        description={`Signed in as ${user.email ?? user.uid}. This workspace is protected by a verified, revocation-aware server session and Firestore role check.`}
        actions={<LogoutButton />}
      />
      <section className="rounded-card border border-border bg-card p-6 shadow-card sm:p-8" aria-labelledby="workspace-summary-title">
        <h2 id="workspace-summary-title" className="text-xl font-bold">Workspace ready</h2>
        <p className="mt-2 text-muted-foreground">
          Use the role-specific navigation to access available FEASTA tools.
        </p>
      </section>
    </div>
  );
}
