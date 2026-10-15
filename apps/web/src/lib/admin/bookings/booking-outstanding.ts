import type {AdminBookingPayment, AdminBookingProviderRequest} from "./admin-booking-types";
import {bookingPaymentTotals} from "./booking-payment-accounting";

export function bookingOutstanding(status: string, estimatedTotal: number, requests: readonly AdminBookingProviderRequest[], payments: readonly AdminBookingPayment[]): number | null {
  if (status === "cancelled") return 0;
  const inactive = new Set(["cancelled", "rejected", "expired"]);
  if (requests.length) {
    let outstanding = 0;
    for (const request of requests.filter(item => !inactive.has(item.status))) {
      const {paid} = bookingPaymentTotals(payments.filter(payment => payment.providerRequestId === request.id));
      if (paid === null) return null;
      outstanding += Math.max(0, Math.round(request.subtotal * 100) - Math.round(paid * 100));
    }
    return outstanding / 100;
  }
  const {paid} = bookingPaymentTotals(payments);
  return paid === null ? null : Math.max(0, Math.round(estimatedTotal * 100) - Math.round(paid * 100)) / 100;
}
