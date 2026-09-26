import {ResetPasswordForm} from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{oobCode?: string}>;
}) {
  const parameters = await searchParams;
  return <ResetPasswordForm code={parameters.oobCode ?? null} />;
}
