"use client";

import {
  FormEvent,
  useRef,
  useState,
} from "react";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {FirebaseError} from "firebase/app";

import {AuthStatus} from "@/components/auth/auth-status";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {signInAdmin} from "@/lib/auth/admin-client";
import {WebAuthenticationError} from "@/lib/auth/client-session";
import {cn} from "@/lib/utils";

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
  const [showPassword, setShowPassword] = useState(false);

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(
    null,
  );
  const [submitError, setSubmitError] = useState<string | null>(
    null,
  );

  const [loading, setLoading] = useState(false);

  function validateEmail(value: string): string | null {
    const normalizedEmail = value.trim();

    if (!normalizedEmail) {
      return "Administrator email is required.";
    }

    if (normalizedEmail.length > 254) {
      return "Email address is too long.";
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
      return "Please enter a valid email address.";
    }

    return null;
  }

  function validatePassword(value: string): string | null {
    if (!value) {
      return "Password is required.";
    }

    if (value.length > 128) {
      return "Password is too long.";
    }

    if (value.length < 8) {
      return "Password must be at least 8 characters long.";
    }

    return null;
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (submitting.current) {
      return;
    }

    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);
    setSubmitError(null);

    if (nextEmailError || nextPasswordError) {
      return;
    }

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
    <main className="flex min-h-screen items-center justify-center bg-[#F5F6F8] px-5 py-10">
      <section
        className={cn(
          "w-full max-w-115",
          "rounded-[18px] border border-black/4",
          "bg-white p-7",
          "shadow-[0_10px_30px_rgba(0,0,0,0.08)]",
          "sm:p-8",
        )}
        aria-labelledby="admin-login-title"
      >
        <header className="text-center">
          <p className="mb-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            Admin portal
          </p>

          <h1
            id="admin-login-title"
            className="text-[26px] font-bold tracking-tight text-foreground"
          >
            Administrator Login
          </h1>

          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            Sign in with your authorized administrator
            account.
          </p>
        </header>

        <div className="mt-6">
          {initialNotice ? (
            <div className="mb-4">
              <AuthStatus message={initialNotice} />
            </div>
          ) : null}

          {submitError ? (
            <div className="mb-4">
              <AuthStatus
                id="admin-login-error"
                message={submitError}
                tone="error"
              />
            </div>
          ) : null}

          <form
            className="grid gap-4"
            onSubmit={submit}
            noValidate
            aria-describedby={
              submitError
                ? "admin-login-error"
                : undefined
            }
          >
            <div className="grid gap-1.5">
              <label
                htmlFor="admin-email"
                className="text-[13px] font-medium text-foreground"
              >
                Email Address
                <span
                  className="ml-1 text-destructive"
                  aria-hidden="true"
                >
                  *
                </span>
              </label>

              <div className="relative">
                <Mail
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                />

                <Input
                  id="admin-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="Enter admin email"
                  value={email}
                  disabled={loading}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={
                    emailError
                      ? "admin-email-error"
                      : undefined
                  }
                  className={cn(
                    "h-12.5 rounded-[10px] bg-muted/60 pl-11",
                    "focus-visible:border-primary",
                    "focus-visible:ring-primary/20",
                    emailError &&
                      "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
                  )}
                  onChange={(event) => {
                    const value = event.target.value;

                    setEmail(value);
                    setSubmitError(null);

                    if (emailError) {
                      setEmailError(validateEmail(value));
                    }
                  }}
                  onBlur={() => {
                    setEmailError(validateEmail(email));
                  }}
                />
              </div>

              {emailError ? (
                <p
                  id="admin-email-error"
                  className="text-xs font-medium text-destructive"
                  role="alert"
                >
                  {emailError}
                </p>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="admin-password"
                className="text-[13px] font-medium text-foreground"
              >
                Password
                <span
                  className="ml-1 text-destructive"
                  aria-hidden="true"
                >
                  *
                </span>
              </label>

              <div className="relative">
                <LockKeyhole
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                />

                <Input
                  id="admin-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  disabled={loading}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={
                    passwordError
                      ? "admin-password-error"
                      : undefined
                  }
                  className={cn(
                    "h-12.5 rounded-[10px] bg-muted/60 pl-11 pr-12",
                    "focus-visible:border-primary",
                    "focus-visible:ring-primary/20",
                    passwordError &&
                      "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
                  )}
                  onChange={(event) => {
                    const value = event.target.value;

                    setPassword(value);
                    setSubmitError(null);

                    if (passwordError) {
                      setPasswordError(
                        validatePassword(value),
                      );
                    }
                  }}
                  onBlur={() => {
                    setPasswordError(
                      validatePassword(password),
                    );
                  }}
                />

                <button
                  type="button"
                  disabled={loading}
                  className={cn(
                    "absolute right-1.5 top-1/2",
                    "flex size-10 -translate-y-1/2 items-center justify-center",
                    "rounded-md text-muted-foreground",
                    "transition-colors",
                    "hover:bg-black/5 hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                    "disabled:pointer-events-none disabled:opacity-50",
                  )}
                  aria-label={
                    showPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  aria-pressed={showPassword}
                  onClick={() => {
                    setShowPassword((current) => !current);
                  }}
                >
                  {showPassword ? (
                    <Eye className="size-5" />
                  ) : (
                    <EyeOff className="size-5" />
                  )}
                </button>
              </div>

              {passwordError ? (
                <p
                  id="admin-password-error"
                  className="text-xs font-medium text-destructive"
                  role="alert"
                >
                  {passwordError}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Link
                href="/admin/forgot-password"
                className={cn(
                  "rounded-sm text-sm font-semibold text-primary",
                  "underline-offset-4 hover:underline",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
                )}
              >
                Forgot password?
              </Link>
            </div>

            <Button
              type="submit"
              fullWidth
              loading={loading}
              loadingLabel="Signing in"
              className="h-13 rounded-full text-[15px] font-semibold shadow-md shadow-primary/20"
            >
              Sign In
            </Button>
          </form>
        </div>
      </section>
    </main>
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

  if (caught instanceof FirebaseError) {
    switch (caught.code) {
      case "auth/invalid-credential":
      case "auth/invalid-login-credentials":
      case "auth/user-not-found":
      case "auth/wrong-password":
        return "The email or password is incorrect.";

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
          code: caught.code,
          message: caught.message,
        });

        return "Admin sign-in could not be completed.";
    }
  }

  console.error("Unexpected admin login error:", caught);
  return "An unexpected error occurred. Please try again.";
}