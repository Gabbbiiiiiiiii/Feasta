"use client";

import {CheckCircle2, Phone, RefreshCw, ShieldCheck} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {useEffect, useRef, useState, type FormEvent} from "react";
import {normalizePhilippineMobile} from "@feasta/shared-types";

import {AuthStatus} from "@/components/auth/auth-status";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {providerPhoneVerificationError} from "@/lib/auth/error-messages";
import {
  confirmProviderPhoneVerification,
  createProviderPhoneRecaptcha,
  requestProviderPhoneVerification,
  type ProviderPhoneVerificationSession,
} from "@/lib/auth/provider-client";

type VerificationState =
  | "READY"
  | "SENDING"
  | "CODE_SENT"
  | "VERIFYING"
  | "VERIFIED"
  | "ERROR";

const RECAPTCHA_CONTAINER_ID = "provider-phone-recaptcha";

export default function ProviderPhoneVerificationForm({
  initialPhoneNumber,
}: {
  initialPhoneNumber: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<VerificationState>("READY");
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [replacement, setReplacement] = useState("");
  const [editingNumber, setEditingNumber] = useState(!initialPhoneNumber);
  const [code, setCode] = useState("");
  const [session, setSession] =
    useState<ProviderPhoneVerificationSession | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verifierRef =
    useRef<ReturnType<typeof createProviderPhoneRecaptcha> | null>(null);

  useEffect(() => () => {
    verifierRef.current?.clear();
    verifierRef.current = null;
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendCode(nextPhone?: string, bypassCooldown = false) {
    if (
      state === "SENDING" ||
      state === "VERIFYING" ||
      (!bypassCooldown && cooldown > 0)
    ) return;
    setState("SENDING");
    setError(null);
    setMessage(null);
    verifierRef.current?.clear();
    const verifier = createProviderPhoneRecaptcha(RECAPTCHA_CONTAINER_ID);
    verifierRef.current = verifier;
    try {
      const nextSession = await requestProviderPhoneVerification(
        verifier,
        nextPhone,
      );
      setSession(nextSession);
      setPhoneNumber(nextSession.phoneNumber);
      setEditingNumber(false);
      setCode("");
      setCooldown(60);
      setState("CODE_SENT");
      setMessage(`A verification code was sent to ${maskPhone(nextSession.phoneNumber)}.`);
    } catch (caught) {
      console.error(
        "[FEASTA provider phone verification] Failed to send verification code:",
        caught,
      );

      verifier.clear();
      verifierRef.current = null;
      if (isProviderSessionExpired(caught)) {
        router.replace("/provider-login");
        router.refresh();
        return;
      }
      setState("ERROR");
      setError(providerPhoneVerificationError(caught));
    }
  }

  function saveReplacement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizePhilippineMobile(replacement);
    if (!normalized) {
      setState("ERROR");
      setError("Enter a valid Philippine mobile number.");
      return;
    }
    setSession(null);
    setCode("");
    setCooldown(0);
    void sendCode(normalized, true);
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || state === "VERIFYING") return;
    if (!/^\d{6}$/u.test(code)) {
      setState("ERROR");
      setError("Enter the 6-digit verification code.");
      return;
    }
    setState("VERIFYING");
    setError(null);
    setMessage(null);
    try {
      const result = await confirmProviderPhoneVerification(session, code);
      setState("VERIFIED");
      setMessage("Your mobile number is verified. Continuing to provider setup.");
      router.replace(result.destination);
      router.refresh();
    } catch (caught) {
      console.error(
        "[FEASTA provider phone verification] Failed to verify code:",
        caught,
      );

      if (isProviderSessionExpired(caught)) {
        router.replace("/provider-login");
        router.refresh();
        return;
      }
      setState("ERROR");
      setError(providerPhoneVerificationError(caught));
    }
  }

  const busy = state === "SENDING" || state === "VERIFYING";
  const codeEntryVisible = session !== null && !editingNumber;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-[76px] w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link
            href="/"
            aria-label="FEASTA home"
            className="inline-flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Image
              src="/images/feasta_logo.png"
              alt=""
              width={40}
              height={40}
              priority
              className="size-10 object-contain"
            />
            <span className="text-[22px] font-bold tracking-[-0.03em] text-primary sm:text-2xl">
              Feasta <span className="text-foreground">provider</span>
            </span>
          </Link>
          <Link
            href="/provider-login"
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Login
          </Link>
        </div>
      </header>

      <section className="px-5 py-10 sm:px-8 sm:py-14 lg:py-16">
        <div className="mx-auto max-w-[660px]">
          <div className="rounded-dialog border border-border bg-card px-5 py-7 shadow-floating sm:px-8 sm:py-9">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-secondary text-primary-strong">
              <Phone aria-hidden="true" className="size-8" />
            </div>
            <div className="mx-auto mt-6 max-w-xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-strong">
                Mobile verification
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Verify your mobile number
              </h1>
              <p className="mt-4 leading-7 text-muted-foreground">
                We&apos;ll send a 6-digit verification code to your registered mobile number.
              </p>
              {phoneNumber ? (
                <p className="mt-2 text-lg font-black tracking-wide">
                  {maskPhone(phoneNumber)}
                </p>
              ) : null}
            </div>

            {editingNumber ? (
              <form className="mt-8 grid gap-4" onSubmit={saveReplacement}>
                <label htmlFor="provider-replacement-phone" className="text-sm font-bold">
                  Mobile number
                </label>
                <Input
                  id="provider-replacement-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="09XX XXX XXXX"
                  value={replacement}
                  disabled={busy}
                  aria-invalid={error ? true : undefined}
                  onChange={(event) => {
                    setReplacement(event.target.value);
                    setError(null);
                  }}
                  className="rounded-[10px]"
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Enter the provider owner or representative mobile number.
                </p>
                <Button
                  type="submit"
                  fullWidth
                  loading={state === "SENDING"}
                  loadingLabel="Sending verification code"
                  className="rounded-[10px]"
                >
                  Send verification code
                </Button>
              </form>
            ) : codeEntryVisible ? (
              <form className="mt-8 grid gap-4" onSubmit={verifyCode}>
                <label htmlFor="provider-phone-code" className="text-sm font-bold">
                  Verification code
                </label>
                <Input
                  id="provider-phone-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  disabled={busy || state === "VERIFIED"}
                  aria-invalid={error ? true : undefined}
                  aria-describedby="provider-phone-code-help"
                  onChange={(event) => {
                    setCode(event.target.value.replace(/\D/gu, "").slice(0, 6));
                    setError(null);
                  }}
                  className="rounded-[10px] text-center text-2xl font-black tracking-[0.4em]"
                />
                <p id="provider-phone-code-help" className="text-sm text-muted-foreground">
                  Enter the six digits from the SMS message.
                </p>
                <Button
                  type="submit"
                  fullWidth
                  loading={state === "VERIFYING"}
                  loadingLabel="Verifying mobile number"
                  disabled={busy || code.length !== 6 || state === "VERIFIED"}
                  className="rounded-[10px]"
                >
                  <CheckCircle2 aria-hidden="true" className="size-5" />
                  Verify mobile number
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  disabled={busy || cooldown > 0}
                  className="rounded-[10px]"
                  onClick={() => void sendCode()}
                >
                  <RefreshCw aria-hidden="true" className="size-5" />
                  {cooldown > 0
                    ? `Resend available in ${cooldown}s`
                    : "Resend verification code"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  fullWidth
                  disabled={busy}
                  className="rounded-[10px]"
                  onClick={() => {
                    setEditingNumber(true);
                    setReplacement("");
                    setError(null);
                    setMessage(null);
                  }}
                >
                  Use another number
                </Button>
              </form>
            ) : (
              <div className="mt-8 grid gap-3">
                <Button
                  fullWidth
                  loading={state === "SENDING"}
                  loadingLabel="Sending verification code"
                  disabled={busy}
                  className="rounded-[10px]"
                  onClick={() => void sendCode()}
                >
                  Send verification code
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  fullWidth
                  disabled={busy}
                  className="rounded-[10px]"
                  onClick={() => setEditingNumber(true)}
                >
                  Use another number
                </Button>
              </div>
            )}

            {message ? (
              <AuthStatus
                className="mt-5"
                tone={state === "VERIFIED" ? "success" : "info"}
                message={message}
              />
            ) : null}
            {error ? (
              <AuthStatus className="mt-5" tone="error" message={error} />
            ) : null}

            <div className="mt-6 rounded-card border border-primary/15 bg-secondary p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-primary-strong"
                />
                <p className="text-sm leading-6 text-muted-foreground">
                  Your mobile number is used for important provider account and booking-related communication.
                </p>
              </div>
            </div>
            <div id={RECAPTCHA_CONTAINER_ID} aria-hidden="true" />
          </div>
        </div>
      </section>
    </main>
  );
}

export function maskPhone(value: string): string {
  const normalized = normalizePhilippineMobile(value);
  if (!normalized) return "your registered mobile number";
  const local = normalized.slice(3);
  return `+63 ${local.slice(0, 3)} ••• ••${local.slice(-2)}`;
}

function isProviderSessionExpired(error: unknown): boolean {
  return typeof error === "object" &&
    error !== null &&
    "reason" in error &&
    error.reason === "session_expired";
}
