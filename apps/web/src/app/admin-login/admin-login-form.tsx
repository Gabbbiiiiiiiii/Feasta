"use client";

import {
  FormEvent,
  useRef,
  useState,
} from "react";
import {CalendarCheck2, ShieldCheck, Users} from "lucide-react";
import {useRouter} from "next/navigation";
import {FirebaseError} from "firebase/app";

import {AuthStatus} from "@/components/auth/auth-status";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {signInAdmin} from "@/lib/auth/admin-client";
import {WebAuthenticationError} from "@/lib/auth/client-session";
import {PortalSignInLayout} from "@/components/auth/portal-sign-in-layout";
import {FormField} from "@/components/forms/form-field";
import {PasswordInput} from "@/components/forms/password-input";
import {signInValidationError} from "@/lib/auth/sign-in-validation";

const adminBenefits = [
  {icon: Users, title: "Manage accounts", description: "Review customer and provider accounts."},
  {icon: ShieldCheck, title: "Review provider applications", description: "Verify providers before they join the marketplace."},
  {icon: CalendarCheck2, title: "Oversee bookings", description: "Review booking activity and handle escalated concerns."},
];

export function AdminLoginForm({
  returnTo,
  initialNotice,
}: {
  returnTo?: string;
  initialNotice?: string;
}) {
  const router = useRouter();
  const submitting = useRef(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(
    null,
  );

  const [loading, setLoading] = useState(false);

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (submitting.current) {
      return;
    }

    const validationError = signInValidationError(email, password);
    setSubmitError(validationError);
    if (validationError) return;

    submitting.current = true;
    setLoading(true);

    try {
      const result = await signInAdmin(
        email.trim(),
        password,
        returnTo,
      );

      router.replace(result.destination);
      router.refresh();
    } catch (caught) {
      setSubmitError(adminLoginError(caught));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <PortalSignInLayout
      eyebrow="Feasta Admin"
      portalLabel="FEASTA Admin Portal"
      introTitle="Manage the FEASTA marketplace."
      introDescription="Access your admin workspace to review accounts, providers, and booking activity."
      title="Administrator Login"
      description="Sign in with your authorized administrator account."
      brandHref="/"
      benefits={adminBenefits}
    >
      <form className="mt-10 grid gap-5" onSubmit={submit} noValidate
        aria-describedby={submitError ? "admin-login-error" : undefined}>
        {initialNotice && <AuthStatus message={initialNotice} />}
        <FormField id="admin-email" label="Admin email" labelClassName="sr-only" required disabled={loading}>
          <Input type="email" name="email" inputMode="email" autoComplete="username"
            placeholder="Email" className="min-h-14 rounded-[10px]" value={email}
            onChange={(event) => {setEmail(event.target.value); setSubmitError(null);}} />
        </FormField>
        <FormField id="admin-password" label="Password" labelClassName="sr-only" required disabled={loading}>
          <PasswordInput name="password" autoComplete="current-password" placeholder="Password"
            className="min-h-14 rounded-[10px]" value={password}
            onChange={(event) => {setPassword(event.target.value); setSubmitError(null);}} />
        </FormField>
        {submitError && <AuthStatus id="admin-login-error" message={submitError} tone="error" />}
        <Button type="submit" fullWidth aria-label="Sign in as admin" loading={loading}
          loadingLabel="Logging in" className="min-h-14 rounded-[10px] text-base font-bold">
          Log in
        </Button>
      </form>
    </PortalSignInLayout>
  );
}

function adminLoginError(caught: unknown): string {
  if (caught instanceof WebAuthenticationError) {
    switch (caught.reason) {
      case "rate_limited":
        return "Too many sign-in attempts. Please wait before trying again.";

      case "unauthorized_role":
        return "This account is not authorized to access the admin portal.";

      case "account_disabled":
        return "This administrator account has been disabled.";

      case "account_blocked":
        return "This administrator account has been blocked.";

      case "missing_profile":
        return "The administrator profile is missing.";

      case "configuration":
      case "account_unavailable":
      case "request_denied":
        return "Admin sign-in is temporarily unavailable. Please try again.";

      default:
        return "Admin sign-in could not be completed.";
    }
  }

  const firebaseCode =
    caught instanceof FirebaseError
      ? caught.code
      : (
          typeof caught === "object" &&
          caught !== null &&
          "code" in caught &&
          typeof caught.code === "string"
        )
        ? caught.code
        : null;

  if (firebaseCode) {
    switch (firebaseCode) {
      case "auth/invalid-credential":
      case "auth/invalid-login-credentials":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "Incorrect email or password. Please try again.";

      case "auth/user-disabled":
        return "This administrator account has been disabled.";

      case "auth/too-many-requests":
        return "Too many failed attempts. Please wait before trying again.";

      case "auth/operation-not-allowed":
        return "Email and password sign-in is not enabled.";

      case "auth/network-request-failed":
        return "Unable to reach Firebase Authentication.";

      default:
        console.error("Unhandled Firebase authentication error:", {
          code: firebaseCode,
        });

        return "Admin sign-in could not be completed.";
    }
  }

  console.error("Unexpected admin login error:", caught);
  return "An unexpected error occurred. Please try again.";
}
