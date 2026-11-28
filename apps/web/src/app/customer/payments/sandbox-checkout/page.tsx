import Link from "next/link";
import {ArrowLeft, ShieldAlert} from "lucide-react";

import {SandboxCheckoutClient} from "@/components/customer/payments/sandbox-checkout-client";
import {requireCustomer} from "@/lib/auth/session";
import {adminDb} from "@/lib/firebase/admin";

const SAFE_ID = /^[A-Za-z0-9_-]{8,160}$/u;

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function centavosValue(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function formatPhp(centavos: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centavos / 100);
}

function paymentChoiceLabel(choice: string): string {
  switch (choice) {
    case "full":
      return "Full payment";
    case "remaining_balance":
      return "Remaining balance";
    case "minimum":
      return "Deposit payment";
    default:
      return "Booking payment";
  }
}

function computeDirectSplitDisplay(input: {
  financialSnapshot: unknown;
  paymentChoice: string;
  amountInCentavos: number;
}): {providerShareFormatted: string; platformFeeFormatted: string} | null {
  if (
    !input.financialSnapshot ||
    typeof input.financialSnapshot !== "object" ||
    Array.isArray(input.financialSnapshot)
  ) {
    return null;
  }

  const snapshot = input.financialSnapshot as Record<string, unknown>;
  const gross = centavosValue(snapshot.grossAmountInCentavos);
  const totalFee = centavosValue(snapshot.platformCommissionTotalInCentavos);
  const isDirectSplit =
    snapshot.settlementRoutingMode === "direct_provider_split_v1" ||
    snapshot.platformCommissionModel === "customer_paid_flat_v1";

  if (!isDirectSplit || gross === null || gross <= 0 || totalFee === null || totalFee > gross) {
    return null;
  }

  let platformFee = 0;
  if (input.paymentChoice === "full") {
    platformFee = totalFee;
  } else if (input.paymentChoice === "minimum") {
    platformFee = Math.round((totalFee * input.amountInCentavos) / gross);
  } else {
    const priorSettled = Math.max(0, gross - input.amountInCentavos);
    const priorFee = priorSettled === 0
      ? 0
      : Math.round((totalFee * priorSettled) / gross);
    platformFee = Math.max(0, totalFee - priorFee);
  }

  platformFee = Math.min(platformFee, input.amountInCentavos);
  const providerShare = Math.max(0, input.amountInCentavos - platformFee);

  return {
    providerShareFormatted: formatPhp(providerShare),
    platformFeeFormatted: formatPhp(platformFee),
  };
}

export default async function CustomerSandboxCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawPaymentId = Array.isArray(params.paymentId)
    ? params.paymentId[0]
    : params.paymentId;
  const rawAttemptId = Array.isArray(params.attemptId)
    ? params.attemptId[0]
    : params.attemptId;

  const query = new URLSearchParams();
  if (rawPaymentId) query.set("paymentId", rawPaymentId);
  if (rawAttemptId) query.set("attemptId", rawAttemptId);
  const search = query.toString();

  const customer = await requireCustomer({
    returnTo: `/customer/payments/sandbox-checkout${search ? `?${search}` : ""}`,
  });

  const paymentId = stringValue(rawPaymentId);
  if (!SAFE_ID.test(paymentId)) {
    return <UnavailableSandboxSession />;
  }

  const paymentRef = adminDb.collection("payments").doc(paymentId);
  const paymentSnapshot = await paymentRef.get();
  if (!paymentSnapshot.exists) {
    return <UnavailableSandboxSession />;
  }

  const payment = (paymentSnapshot.data() ?? {}) as Record<string, unknown>;
  if (stringValue(payment.customerId) !== customer.uid) {
    return <UnavailableSandboxSession />;
  }

  const currentAttemptId = stringValue(payment.currentCheckoutAttemptId);
  let checkoutId = stringValue(payment.paymongoCheckoutId);
  if (!checkoutId && currentAttemptId) {
    const attemptSnap = await paymentRef
      .collection("checkoutAttempts")
      .doc(currentAttemptId)
      .get();
    checkoutId = stringValue(attemptSnap.data()?.paymongoCheckoutId);
  }

  if (!checkoutId.startsWith("cs_sandbox_")) {
    return <UnavailableSandboxSession />;
  }

  const bookingId = stringValue(payment.mainEventId) || stringValue(payment.bookingId);
  const providerRequestId = stringValue(payment.providerRequestId);
  const providerId = stringValue(payment.providerId);
  const amountInCentavos = centavosValue(payment.amountInCentavos);

  if (!bookingId || !providerRequestId || !amountInCentavos || amountInCentavos <= 0) {
    return <UnavailableSandboxSession />;
  }

  const [bookingSnap, providerRequestSnap, providerSnap] = await Promise.all([
    adminDb.collection("mainEvents").doc(bookingId).get(),
    adminDb.collection("providerRequests").doc(providerRequestId).get(),
    providerId
      ? adminDb.collection("providers").doc(providerId).get()
      : Promise.resolve(null),
  ]);

  const booking = (bookingSnap.data() ?? {}) as Record<string, unknown>;
  const providerRequest = (providerRequestSnap.data() ?? {}) as Record<string, unknown>;
  const provider = (providerSnap?.data() ?? {}) as Record<string, unknown>;

  const providerName =
    stringValue(provider.businessName) ||
    stringValue(providerRequest.providerName) ||
    "Event provider";
  const serviceLabel =
    stringValue(providerRequest.serviceName) ||
    stringValue(providerRequest.packageName) ||
    stringValue(providerRequest.categoryName) ||
    "Event service";
  const bookingCode =
    stringValue(booking.bookingCode) ||
    stringValue(booking.referenceCode) ||
    bookingId.slice(0, 12).toUpperCase();
  const paymentChoice = stringValue(payment.paymentChoice);
  const paymentStatus = stringValue(payment.status) || "processing";

  const splitBreakdown = computeDirectSplitDisplay({
    financialSnapshot: providerRequest.financialSnapshot,
    paymentChoice,
    amountInCentavos,
  });

  return (
    <SandboxCheckoutClient
      paymentId={paymentId}
      checkoutSessionId={checkoutId}
      bookingId={bookingId}
      bookingCode={bookingCode}
      providerName={providerName}
      serviceLabel={serviceLabel}
      paymentChoiceLabel={paymentChoiceLabel(paymentChoice)}
      amountFormatted={formatPhp(amountInCentavos)}
      paymentStatus={paymentStatus}
      providerShareFormatted={splitBreakdown?.providerShareFormatted ?? null}
      platformFeeFormatted={splitBreakdown?.platformFeeFormatted ?? null}
    />
  );
}

function UnavailableSandboxSession() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6 py-4">
      <section
        className="grid gap-4 rounded-2xl border border-warning/30 bg-card p-6 shadow-sm"
        role="alert"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning-subtle text-warning">
            <ShieldAlert aria-hidden="true" className="size-5" />
          </div>
          <div className="grid gap-1">
            <h1 className="text-lg font-bold text-foreground">
              Sandbox checkout session unavailable
            </h1>
            <p className="text-sm leading-6 text-muted-foreground">
              We could not find an active sandbox payment session for this link.
              Return to your booking or payments page to start a fresh checkout.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href="/customer/payments"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to payments
          </Link>
          <Link
            href="/customer/bookings"
            className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted/50"
          >
            View bookings
          </Link>
        </div>
      </section>
    </div>
  );
}
