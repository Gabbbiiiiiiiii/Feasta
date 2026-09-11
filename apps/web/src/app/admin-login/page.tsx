import {AdminLoginForm} from "./admin-login-form";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{next?: string; reason?: string}>;
}) {
  const parameters = await searchParams;
  return (
    <AdminLoginForm
      returnTo={parameters.next}
      initialNotice={parameters.reason === "session-expired"
        ? "Your admin session ended. Sign in again to continue."
        : undefined}
    />
  );
}
