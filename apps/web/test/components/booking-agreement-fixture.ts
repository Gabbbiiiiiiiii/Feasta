import type {BookingAgreementDisclosure} from "@/lib/customer/bookings/customer-booking-agreement";

export const bookingAgreementFixture = (providerId: string, providerName = "Maria's Catering"): BookingAgreementDisclosure => ({
  schemaVersion: 1, timingSchemaVersion: 3, agreementKey: "a".repeat(64), providerId, providerName,
  serviceNames: [
  "Birthday Buffet Package",
],

serviceTierLabel:
  "Buffet Setup",

depositEligibilityCutoffAt:
  "2026-10-13T10:00:00.000Z",
  eventStartAt: "2026-10-16T10:00:00.000Z", remainingBalanceDueAt: "2026-10-14T10:00:00.000Z",
  hardPaymentDeadlineAt: "2026-10-15T10:00:00.000Z", preparationStartsAt: "2026-10-15T10:00:00.000Z",
  grossAmountInCentavos: 1000000, requiredUpfrontAmountInCentavos: 500000, remainingBalanceInCentavos: 500000,
  depositEligible: true, paymentDefaultAllocation: {customerDefaultRefundAmountInCentavos: 350000,
    providerReservationCompAmountInCentavos: 100000, feastaCancellationFeeAmountInCentavos: 50000},
});
