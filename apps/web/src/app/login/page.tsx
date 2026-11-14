import {LoginForm} from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string;
    reason?: string;
    mode?: string;
  }>;
}) {
  const parameters = await searchParams;

  return (
    <LoginForm
      returnTo={parameters.next}
      initialMode={
        parameters.mode === "email"
          ? "email"
          : "gateway"
      }
      initialNotice={
        parameters.reason === "session-expired"
          ? "Your session ended. Sign in again to continue."
          : undefined
      }
    />
  );
}