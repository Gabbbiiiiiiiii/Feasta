import {LogoutButton} from "@/components/auth/logout-button";
import {requireRole, type UserRole} from "@/lib/auth/session";

export async function RoleHome({role}: {role: UserRole}) {
  const user = await requireRole([role]);
  return (
    <main className="mx-auto max-w-3xl p-8">
      <section className="rounded-3xl border border-black/5 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-widest text-[#FF6333]">
          {role} session
        </p>
        <h1 className="mt-3 text-3xl font-bold">Authenticated FEASTA access</h1>
        <p className="mt-3 text-[#8C817A]">
          Signed in as {user.email ?? user.uid}. This page is protected by a
          verified, revocation-aware server session and Firestore role check.
        </p>
        <div className="mt-6"><LogoutButton /></div>
      </section>
    </main>
  );
}
