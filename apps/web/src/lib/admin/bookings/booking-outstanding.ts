import type {AdminBookingPayment, AdminBookingProviderRequest} from "./admin-booking-types";

/** Presentation only: refunded payments are history, never a new obligation. */
export function bookingOutstanding(status: string, estimatedTotal: number,
  requests: readonly AdminBookingProviderRequest[], payments: readonly AdminBookingPayment[]): number {
  if (status === "cancelled") return 0;
  const inactive = new Set(["cancelled", "rejected", "expired"]);
  if (requests.length) {
    const due = requests.filter(request => !inactive.has(request.status)).reduce((sum, request) => {
      const paid = payments.filter(payment => payment.providerRequestId === request.id && payment.status === "paid")
        .reduce((total, payment) => total + payment.amountInCentavos, 0);
      return sum + Math.max(0, Math.round(request.subtotal * 100) - paid);
    }, 0);
    return due / 100;
  }
  const paid = payments.filter(payment => payment.status === "paid")
    .reduce((sum, payment) => sum + payment.amountInCentavos, 0);
  return Math.max(0, Math.round(estimatedTotal * 100) - paid) / 100;
}
