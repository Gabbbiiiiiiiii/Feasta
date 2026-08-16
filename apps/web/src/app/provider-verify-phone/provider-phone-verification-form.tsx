"use client";

import {CheckCircle2, Phone, RefreshCw, ShieldCheck} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
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
const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 5 * 60;

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
  const [expirySeconds, setExpirySeconds] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verifierRef =
    useRef<ReturnType<typeof createProviderPhoneRecaptcha> | null>(null);

  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    return () => {
      verifierRef.current?.clear();
      verifierRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;

    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (expirySeconds <= 0) return;

    const timer = window.setInterval(() => {
      setExpirySeconds((value) => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [expirySeconds]);

  useEffect(() => {
    if (!session || editingNumber) return;

    const frame = window.requestAnimationFrame(() => {
      otpInputRefs.current[0]?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [session, editingNumber]);

  async function sendCode(
    nextPhone?: string,
    bypassCooldown = false,
  ) {
    if (
      state === "SENDING" ||
      state === "VERIFYING" ||
      (!bypassCooldown && cooldown > 0)
    ) {
      return;
    }

    setState("SENDING");
    setError(null);
    setMessage(null);

    verifierRef.current?.clear();

    const verifier = createProviderPhoneRecaptcha(
      RECAPTCHA_CONTAINER_ID,
    );

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
      setExpirySeconds(OTP_EXPIRY_SECONDS);
      setState("CODE_SENT");
      setMessage(
        `A verification code was sent to ${maskPhone(
          nextSession.phoneNumber,
        )}.`,
      );
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

    if (expirySeconds <= 0) {
      setState("ERROR");
      setError(
        "This verification code has expired. Request a new code to continue.",
      );
      return;
    }

    if (!/^\d{6}$/u.test(code)) {
      setState("ERROR");
      setError("Enter the 6-digit verification code.");

      const firstEmptyIndex = Array.from(
        {length: OTP_LENGTH},
        (_, index) => code[index] ?? "",
      ).findIndex((digit) => digit === "");

      otpInputRefs.current[
        firstEmptyIndex >= 0 ? firstEmptyIndex : 0
      ]?.focus();

      return;
    }

    setState("VERIFYING");
    setError(null);
    setMessage(null);

    try {
      const result = await confirmProviderPhoneVerification(
        session,
        code,
      );

      setState("VERIFIED");
      setMessage(
        "Your mobile number is verified. Continuing to provider setup.",
      );

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

  function updateOtpDigit(index: number, rawValue: string) {
    const digits = rawValue.replace(/\D/gu, "");

    if (!digits) {
      const nextCode = Array.from(
        {length: OTP_LENGTH},
        (_, position) => code[position] ?? "",
      );

      nextCode[index] = "";

      setCode(nextCode.join(""));
      setError(null);
      return;
    }

    /*
     * Browsers/password managers may place the complete SMS code into
     * a single field. Handle that case in addition to ordinary
     * one-character typing.
     */
    if (digits.length > 1) {
      applyOtpSequence(digits, index);
      return;
    }

    const nextCode = Array.from(
      {length: OTP_LENGTH},
      (_, position) => code[position] ?? "",
    );

    nextCode[index] = digits[0] ?? "";

    setCode(nextCode.join(""));
    setError(null);

    if (index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus();
      otpInputRefs.current[index + 1]?.select();
    }
  }

  function applyOtpSequence(rawValue: string, startIndex = 0) {
    const digits = rawValue
      .replace(/\D/gu, "")
      .slice(0, OTP_LENGTH - startIndex);

    if (!digits) return;

    const nextCode = Array.from(
      {length: OTP_LENGTH},
      (_, position) => code[position] ?? "",
    );

    digits.split("").forEach((digit, offset) => {
      const position = startIndex + offset;

      if (position < OTP_LENGTH) {
        nextCode[position] = digit;
      }
    });

    const normalizedCode = nextCode.join("").slice(0, OTP_LENGTH);

    setCode(normalizedCode);
    setError(null);

    const nextFocusIndex = Math.min(
      startIndex + digits.length,
      OTP_LENGTH - 1,
    );

    window.requestAnimationFrame(() => {
      otpInputRefs.current[nextFocusIndex]?.focus();
      otpInputRefs.current[nextFocusIndex]?.select();
    });
  }

  function handleOtpKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace") {
      if (code[index]) {
        const nextCode = Array.from(
          {length: OTP_LENGTH},
          (_, position) => code[position] ?? "",
        );

        nextCode[index] = "";
        setCode(nextCode.join(""));
        setError(null);

        event.preventDefault();
        return;
      }

      if (index > 0) {
        const previousIndex = index - 1;

        const nextCode = Array.from(
          {length: OTP_LENGTH},
          (_, position) => code[position] ?? "",
        );

        nextCode[previousIndex] = "";
        setCode(nextCode.join(""));
        setError(null);

        otpInputRefs.current[previousIndex]?.focus();

        event.preventDefault();
      }

      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      otpInputRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      event.preventDefault();
      otpInputRefs.current[index + 1]?.focus();
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      otpInputRefs.current[0]?.focus();
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      otpInputRefs.current[OTP_LENGTH - 1]?.focus();
    }
  }

  function handleOtpPaste(
    index: number,
    event: ClipboardEvent<HTMLInputElement>,
  ) {
    const pasted = event.clipboardData.getData("text");
    const digits = pasted.replace(/\D/gu, "");

    if (!digits) return;

    event.preventDefault();
    applyOtpSequence(digits, index);
  }

  const busy =
  state === "SENDING" ||
  state === "VERIFYING";

  const codeEntryVisible =
    session !== null &&
    !editingNumber;

  const codeExpired =
    codeEntryVisible &&
    expirySeconds <= 0 &&
    session !== null;

  const expiryLabel = formatCountdown(expirySeconds);

  const otpDigits = Array.from(
    {length: OTP_LENGTH},
    (_, index) => code[index] ?? "",
  );

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
              Feasta{" "}
              <span className="text-foreground">
                provider
              </span>
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
              <Phone
                aria-hidden="true"
                className="size-8"
              />
            </div>

            <div className="mx-auto mt-6 max-w-xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-strong">
                Mobile verification
              </p>

              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
                Verify your mobile number
              </h1>

              <p className="mt-4 leading-7 text-muted-foreground">
                We&apos;ll send a 6-digit verification
                code to your registered mobile number.
              </p>

              {phoneNumber ? (
                <p className="mt-2 text-lg font-black tracking-wide">
                  {maskPhone(phoneNumber)}
                </p>
              ) : null}
            </div>

            {editingNumber ? (
              <form
                className="mt-8 grid gap-4"
                onSubmit={saveReplacement}
              >
                <label
                  htmlFor="provider-replacement-phone"
                  className="text-sm font-bold"
                >
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
                  Enter the provider owner or representative
                  mobile number.
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
              <form
                className="mt-8 grid gap-4"
                onSubmit={verifyCode}
              >
                <div>
                  <p
                    id="provider-phone-code-label"
                    className="text-sm font-bold"
                  >
                    Verification code
                  </p>

                  <div
                    className="mt-3 flex w-full justify-center gap-2 sm:gap-3"
                    role="group"
                    aria-labelledby="provider-phone-code-label"
                    aria-describedby="provider-phone-code-help"
                  >
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={(element) => {
                          otpInputRefs.current[index] =
                            element;
                        }}
                        id={`provider-phone-code-${index + 1}`}
                        type="text"
                        inputMode="numeric"
                        autoComplete={
                          index === 0
                            ? "one-time-code"
                            : "off"
                        }
                        value={digit}
                        disabled={
                        busy ||
                        state === "VERIFIED" ||
                        codeExpired
                      }
                        aria-label={`Verification code digit ${
                          index + 1
                        } of ${OTP_LENGTH}`}
                        aria-invalid={
                          error ? true : undefined
                        }
                        onFocus={(event) =>
                          event.currentTarget.select()
                        }
                        onChange={(event) =>
                          updateOtpDigit(
                            index,
                            event.target.value,
                          )
                        }
                        onKeyDown={(event) =>
                          handleOtpKeyDown(
                            index,
                            event,
                          )
                        }
                        onPaste={(event) =>
                          handleOtpPaste(index, event)
                        }
                        className={[
                          "h-14 min-w-0 flex-1 rounded-xl border bg-background text-center text-xl font-black tabular-nums outline-none transition-all duration-150",
                          "max-w-[64px] sm:h-16 sm:max-w-[72px] sm:text-2xl",
                          "focus:border-primary focus:ring-4 focus:ring-primary/10",
                          "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60",
                          error
                            ? "border-destructive"
                            : "border-input",
                        ].join(" ")}
                      />
                    ))}
                  </div>
                </div>

                <div
                  id="provider-phone-code-help"
                  className="grid gap-2"
                >
                  <p className="text-center text-sm text-muted-foreground">
                    Enter the six digits from the SMS message.
                  </p>

                  {!codeExpired ? (
                    <p
                      className="text-center text-sm font-medium text-muted-foreground"
                      aria-live="polite"
                    >
                      Code expires in{" "}
                      <span className="font-bold tabular-nums text-foreground">
                        {expiryLabel}
                      </span>
                    </p>
                  ) : (
                    <div
                      role="status"
                      className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-4 py-3 text-center"
                    >
                      <p className="text-sm font-bold text-destructive">
                        This verification code has expired.
                      </p>

                      <p className="mt-1 text-sm text-muted-foreground">
                        Request a new code to continue.
                      </p>
                    </div>
                  )}
                </div>

                <Button
                  type="submit"
                  fullWidth
                  loading={state === "VERIFYING"}
                  loadingLabel="Verifying mobile number"
                  disabled={
                    busy ||
                    code.length !== OTP_LENGTH ||
                    state === "VERIFIED" ||
                    codeExpired
                  }
                  className="rounded-[10px]"
                >
                  <CheckCircle2
                    aria-hidden="true"
                    className="size-5"
                  />
                  Verify mobile number
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  disabled={
                    busy ||
                    (!codeExpired && cooldown > 0)
                  }
                  className="rounded-[10px]"
                  onClick={() => void sendCode()}
                >
                  <RefreshCw
                    aria-hidden="true"
                    className="size-5"
                  />

                  {codeExpired
                    ? "Request a new verification code"
                    : cooldown > 0
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
                  setSession(null);
                  setCode("");
                  setCooldown(0);
                  setExpirySeconds(0);
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
                  onClick={() =>
                    setEditingNumber(true)
                  }
                >
                  Use another number
                </Button>
              </div>
            )}

            {message ? (
              <AuthStatus
                className="mt-5"
                tone={
                  state === "VERIFIED"
                    ? "success"
                    : "info"
                }
                message={message}
              />
            ) : null}

            {error ? (
              <AuthStatus
                className="mt-5"
                tone="error"
                message={error}
              />
            ) : null}

            <div className="mt-6 rounded-card border border-primary/15 bg-secondary p-5">
              <div className="flex items-start gap-3">
                <ShieldCheck
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-primary-strong"
                />

                <p className="text-sm leading-6 text-muted-foreground">
                  Your mobile number is used for important
                  provider account and booking-related
                  communication.
                </p>
              </div>
            </div>

            <div
              id={RECAPTCHA_CONTAINER_ID}
              aria-hidden="true"
            />
          </div>
        </div>
      </section>
    </main>
  );
}

export function maskPhone(value: string): string {
  const normalized = normalizePhilippineMobile(value);

  if (!normalized) {
    return "your registered mobile number";
  }

  const local = normalized.slice(3);

  return `+63 ${local.slice(0, 3)} ••• ••${local.slice(-2)}`;
}

function isProviderSessionExpired(
  error: unknown,
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "reason" in error &&
    error.reason === "session_expired"
  );
}

function formatCountdown(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  return `${minutes}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
}