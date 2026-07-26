import {LoginForm} from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{next?: string; reason?: string}>;
}) {
  const parameters = await searchParams;
  return (
    <LoginForm
      returnTo={parameters.next}
      initialNotice={parameters.reason === "session-expired"
        ? "Your session ended. Sign in again to continue."
        : undefined}
    />
  );
}
