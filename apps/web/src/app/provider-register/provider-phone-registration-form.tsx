"use client";

import {CheckCircle2, RefreshCw, ShieldCheck} from "lucide-react";
import {useRouter} from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {ConfirmationResult} from "firebase/auth";
import {normalizePhilippineMobile} from "@feasta/shared-types";

import {AuthStatus} from "@/components/auth/auth-status";
import {FormField} from "@/components/forms/form-field";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {providerPhoneVerificationError} from "@/lib/auth/error-messages";
import {
  abandonProviderPhoneRegistration,
  confirmProviderRegistrationPhoneCode,
  createProviderPhoneRecaptcha,
  requestProviderRegistrationPhoneCode,
  resumeExistingProviderAfterPhoneAuth,
  resumeProviderPhoneRegistration,
  type ProviderPhoneRegistrationResult,
} from "@/lib/auth/provider-client";

const RECAPTCHA_CONTAINER_ID = "provider-registration-phone-recaptcha";
const RESEND_COOLDOWN_SECONDS = 60;
const OTP_EXPIRY_SECONDS = 5 * 60;

type RegistrationView = "checking" | "phone" | "otp" | "complete";

export function ProviderPhoneRegistrationForm() {
  const router = useRouter();
  const [view, setView] = useState<RegistrationView>("checking");
  const [phoneInput, setPhoneInput] = useState("");
  const [verifiedPhone, setVerifiedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [expiry, setExpiry] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const verifierRef = useRef<ReturnType<
    typeof createProviderPhoneRecaptcha
  > | null>(null);
  const actionInProgress = useRef(false);
  const resumeChecked = useRef(false);

  const handleClassification = useCallback(async (
    result: ProviderPhoneRegistrationResult,
    cancelled = false,
  ) => {
    if (
      result.classification === "non_provider_account" ||
      result.classification === "malformed_provider_relationship"
    ) {
      await abandonProviderPhoneRegistration().catch(() => undefined);
      if (!cancelled) {
        setView("phone");
        setError(
          "This mobile sign-in cannot continue provider registration. Use the appropriate FEASTA sign-in or contact support.",
        );
      }
      return;
    }

    if (
      result.classification === "registered_provider" ||
      (
        result.classification === "provider_identity" &&
        result.resolution.state !== "email_credential_link_required"
      )
    ) {
      const session = await resumeExistingProviderAfterPhoneAuth();
      if (!cancelled) {
        router.replace(session.destination);
        router.refresh();
      }
      return;
    }

    if (!cancelled) {
      setView("complete");
      setMessage(
        "Your mobile number is verified. Your Firebase phone session is ready for the account-details step.",
      );
    }
  }, [router]);

  useEffect(() => {
    if (resumeChecked.current) return;
    resumeChecked.current = true;
    let cancelled = false;

    void resumeProviderPhoneRegistration()
      .then(async (result) => {
        if (cancelled) return;
        if (!result) {
          setView("phone");
          return;
        }
        await handleClassification(result, cancelled);
      })
      .catch(() => {
        if (!cancelled) {
          setView("phone");
          setError("We could not restore registration. Verify your number again.");
        }
      });

    return () => {
      cancelled = true;
      verifierRef.current?.clear();
      verifierRef.current = null;
      confirmationRef.current = null;
    };
  }, [handleClassification]);

  useEffect(() => countdown(cooldown, setCooldown), [cooldown]);
  useEffect(() => countdown(expiry, setExpiry), [expiry]);

  function resetVerifier() {
    verifierRef.current?.clear();
    const verifier = createProviderPhoneRecaptcha(RECAPTCHA_CONTAINER_ID);
    verifierRef.current = verifier;
    return verifier;
  }

  async function sendCode(phoneNumber: string) {
    if (actionInProgress.current) return;
    const normalized = normalizePhoneInput(phoneNumber);
    if (!normalized) {
      setError("Enter a valid Philippine mobile number.");
      return;
    }

    actionInProgress.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await requestProviderRegistrationPhoneCode(
        normalized,
        resetVerifier,
      );
      confirmationRef.current = result.confirmation;
      setVerifiedPhone(result.phoneNumber);
      setOtp("");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setExpiry(OTP_EXPIRY_SECONDS);
      setView("otp");
      setMessage(`We sent a verification code to ${maskPhone(result.phoneNumber)}.`);
    } catch (caught) {
      verifierRef.current?.clear();
      verifierRef.current = null;
      setError(providerPhoneVerificationError(caught));
    } finally {
      actionInProgress.current = false;
      setBusy(false);
    }
  }

  function submitPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendCode(phoneInput);
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (actionInProgress.current) return;
    if (!confirmationRef.current) {
      setError("Send a new verification code to continue.");
      return;
    }
    if (expiry <= 0) {
      setError("This verification code expired. Send a new code to continue.");
      return;
    }
    if (!/^\d{6}$/u.test(otp)) {
      setError("Enter the 6-digit verification code.");
      return;
    }

    actionInProgress.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await confirmProviderRegistrationPhoneCode(
        confirmationRef.current,
        otp,
        verifiedPhone,
      );
      confirmationRef.current = null;
      verifierRef.current?.clear();
      verifierRef.current = null;
      await handleClassification(result);
    } catch (caught) {
      setError(providerPhoneVerificationError(caught));
    } finally {
      actionInProgress.current = false;
      setBusy(false);
    }
  }

  function changeNumber() {
    confirmationRef.current = null;
    verifierRef.current?.clear();
    verifierRef.current = null;
    setOtp("");
    setCooldown(0);
    setExpiry(0);
    setError(null);
    setMessage(null);
    setView("phone");
  }

  if (view === "checking") {
    return (
      <div role="status" className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground">
        <RefreshCw aria-hidden="true" className="size-5 animate-spin text-primary" />
        Checking for an existing secure registration session...
      </div>
    );
  }

  if (view === "complete") {
    return (
      <div className="py-5 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 aria-hidden="true" className="size-8" />
        </span>
        <h2 className="mt-5 text-2xl font-black">Mobile number verified</h2>
        <AuthStatus id="provider-phone-complete" message={message ?? "Mobile verification complete."} tone="success" />
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Account details and email credential linking are completed in the next registration stage.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6">
        <span className="flex size-11 items-center justify-center rounded-[10px] bg-secondary text-primary-strong">
          <ShieldCheck aria-hidden="true" className="size-6" />
        </span>
        <h2 className="mt-4 text-2xl font-black tracking-[-0.025em] sm:text-3xl">
          {view === "phone" ? "Create your provider account" : "Verify your mobile number"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {view === "phone"
            ? "Start by verifying your mobile number. FEASTA uses it for secure provider identity and booking-related communication."
            : `Enter the 6-digit code sent to ${maskPhone(verifiedPhone)}.`}
        </p>
      </div>

      {view === "phone" ? (
        <form onSubmit={submitPhone} className="grid gap-4" noValidate>
          <FormField
            id="provider-registration-phone"
            label="Mobile number"
            required
            disabled={busy}
            error={error?.includes("valid Philippine") ? error : undefined}
          >
            <div className="flex rounded-[10px] border border-input bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
              <span className="flex h-14 shrink-0 items-center border-r border-input px-4 text-sm font-bold">
                <span className="sr-only">Philippines country code</span>+63
              </span>
              <Input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="9XXXXXXXXX"
                maxLength={16}
                value={phoneInput}
                onChange={(event) => setPhoneInput(localPhoneDisplayValue(event.target.value))}
                className="h-14 rounded-l-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">Country: Philippines (+63)</p>
          </FormField>
          {error && !error.includes("valid Philippine") ? (
            <AuthStatus id="provider-phone-error" message={error} tone="error" />
          ) : null}
          <Button type="submit" fullWidth loading={busy} loadingLabel="Sending verification code" className="h-[52px] rounded-[10px]">
            Send verification code
          </Button>
        </form>
      ) : (
        <form onSubmit={verifyOtp} className="grid gap-4" noValidate>
          <FormField id="provider-registration-otp" label="Verification code" required disabled={busy}>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="6-digit code"
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/gu, "").slice(0, 6))}
              className="h-14 rounded-[10px] text-center text-xl font-black tracking-[0.35em]"
            />
          </FormField>
          {message ? <AuthStatus id="provider-phone-message" message={message} tone="success" /> : null}
          {error ? <AuthStatus id="provider-phone-error" message={error} tone="error" /> : null}
          <Button type="submit" fullWidth loading={busy} loadingLabel="Verifying code" className="h-[52px] rounded-[10px]">
            Verify mobile number
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <button type="button" onClick={changeNumber} disabled={busy} className="min-h-11 font-bold text-primary-strong underline underline-offset-4 disabled:opacity-50">
              Change number
            </button>
            <button
              type="button"
              disabled={busy || cooldown > 0}
              onClick={() => void sendCode(verifiedPhone)}
              className="min-h-11 font-bold text-primary-strong underline underline-offset-4 disabled:text-muted-foreground disabled:no-underline"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
            </button>
          </div>
          {expiry > 0 ? (
            <p className="text-center text-xs text-muted-foreground">Code expires in {formatCountdown(expiry)}.</p>
          ) : null}
        </form>
      )}
      <div id={RECAPTCHA_CONTAINER_ID} aria-hidden="true" />
    </>
  );
}

function normalizePhoneInput(value: string): string | null {
  const candidate = value.trim();
  return normalizePhilippineMobile(candidate.startsWith("9") ? `+63${candidate}` : candidate);
}

function localPhoneDisplayValue(value: string): string {
  const candidate = value.replace(/[^\d+\s-]/gu, "").trimStart();
  if (candidate.startsWith("+63")) return candidate.slice(3).trimStart();
  if (candidate.startsWith("63")) return candidate.slice(2).trimStart();
  if (candidate.startsWith("0")) return candidate.slice(1);
  return candidate;
}

function maskPhone(phoneNumber: string): string {
  return `${phoneNumber.slice(0, 6)}****${phoneNumber.slice(-2)}`;
}

function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function countdown(value: number, update: (value: number) => void) {
  if (value <= 0) return undefined;
  const timer = window.setTimeout(() => update(Math.max(0, value - 1)), 1000);
  return () => window.clearTimeout(timer);
}
