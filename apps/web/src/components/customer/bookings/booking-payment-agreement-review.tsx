"use client";

import type {
  BookingAgreementDisclosure,
} from "@/lib/customer/bookings/customer-booking-agreement";

const money = (
  amount: number,
) =>
  new Intl.NumberFormat(
    "en-PH",
    {
      style: "currency",
      currency: "PHP",
    },
  ).format(amount / 100);

export const agreementTime = (
  time: string,
) =>
  new Intl.DateTimeFormat(
    "en-PH",
    {
      timeZone:
        "Asia/Manila",

      year: "numeric",
      month: "long",
      day: "numeric",

      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    },
  ).format(new Date(time));

export function BookingPaymentAgreementReview({
  agreements,
  acknowledged,
  onChange,
  error,
  onReload,
}: {
  agreements:
    readonly BookingAgreementDisclosure[];

  acknowledged:
    Readonly<
      Record<
        string,
        string
      >
    >;

  onChange: (
    providerId: string,
    key: string | null,
  ) => void;

  error: string | null;

  onReload: () => void;
}) {
  return (
    <section
      className="rounded-2xl border border-feasta-divider p-5"
      aria-label="Booking & Payment Agreement"
    >
      <h3 className="font-bold">
        Booking &amp; Payment
        Agreement
      </h3>

      <p className="text-sm">
        These terms are calculated
        by FEASTA from your current
        booking. All times are in
        Asia/Manila.
      </p>

      {error && (
        <p role="alert">
          {error}
        </p>
      )}

      {!agreements.length && (
        <button
          type="button"
          onClick={onReload}
        >
          Review current booking
          agreement
        </button>
      )}

      {agreements.map(
        (agreement) => (
          <div
            key={
              agreement.providerId
            }
            className="mt-5 space-y-3"
          >
            <h4 className="font-semibold">
              {
                agreement.providerName
              }
            </h4>

            <dl className="space-y-1">
              <dt>
                {agreement
                  .serviceNames
                  .length === 1
                  ? "Service"
                  : "Services"}
              </dt>

              <dd>
                {agreement.serviceNames.join(
                  ", ",
                )}
              </dd>

              {agreement.serviceTierLabel && (
                <>
                  <dt>
                    Service level
                  </dt>

                  <dd>
                    {
                      agreement.serviceTierLabel
                    }
                  </dd>
                </>
              )}

              <dt>
                Scheduled event
                start
              </dt>

              <dd>
                {agreementTime(
                  agreement.eventStartAt,
                )}
              </dd>

              <dt>
                Service total
              </dt>

              <dd>
                {money(
                  agreement.grossAmountInCentavos,
                )}
              </dd>

              <dt>
                {agreement.depositEligible
                  ? "Deposit"
                  : "Full payment"}
              </dt>

              <dd>
                {money(
                  agreement.requiredUpfrontAmountInCentavos,
                )}
              </dd>

              <dt>
                Remaining balance
              </dt>

              <dd>
                {money(
                  agreement.remainingBalanceInCentavos,
                )}
              </dd>
            </dl>

            {(agreement.depositEligible ||
              agreement.eligibilityReason ===
                "short_notice") && (
              <div>
                <p className="font-medium">
                  Deposit eligibility
                  cutoff
                </p>

                <p>
                  {agreementTime(
                    agreement.depositEligibilityCutoffAt,
                  )}
                </p>
              </div>
            )}

            {agreement.depositEligible ? (
              <p>
                The deposit option is
                currently available.
                Submit this booking on
                or before{" "}
                {agreementTime(
                  agreement.depositEligibilityCutoffAt,
                )}{" "}
                to keep the deposit
                option. Deposit
                eligibility is
                finalized when the
                booking request is
                submitted.
              </p>
            ) : agreement.eligibilityReason ===
              "short_notice" ? (
              <p>
                Full payment is
                required because the
                72-hour deposit
                eligibility cutoff has
                already passed.
              </p>
            ) : (
              <p>
                Full payment is
                required under this
                service&apos;s saved
                payment policy.
              </p>
            )}

            {agreement.depositEligible && (
              <>
                <p>
                  Remaining balance
                  becomes due:{" "}
                  {agreementTime(
                    agreement.remainingBalanceDueAt,
                  )}
                </p>

                <p>
                  Final payment
                  deadline:{" "}
                  {agreementTime(
                    agreement.hardPaymentDeadlineAt,
                  )}
                </p>

                <h5 className="font-semibold">
                  Failure to Pay
                  Remaining Balance
                </h5>

                <p>
                  If the remaining
                  balance is not
                  settled by{" "}
                  {agreementTime(
                    agreement.hardPaymentDeadlineAt,
                  )}
                  , this booking will
                  be automatically
                  cancelled and will
                  not enter the
                  Preparation Period.
                  A payment started
                  before the deadline
                  may await final
                  confirmation.
                </p>

                <dl className="space-y-1">
                  <dt>
                    Refund to you
                  </dt>

                  <dd>
                    {money(
                      agreement
                        .paymentDefaultAllocation!
                        .customerDefaultRefundAmountInCentavos,
                    )}
                  </dd>

                  <dt>
                    Provider
                    reservation
                    compensation
                  </dt>

                  <dd>
                    {money(
                      agreement
                        .paymentDefaultAllocation!
                        .providerReservationCompAmountInCentavos,
                    )}
                  </dd>

                  <dt>
                    FEASTA
                    cancellation/platform
                    fee
                  </dt>

                  <dd>
                    {money(
                      agreement
                        .paymentDefaultAllocation!
                        .feastaCancellationFeeAmountInCentavos,
                    )}
                  </dd>
                </dl>

                <p>
                  This payment-default
                  rule is separate
                  from the
                  Cancellation Refund
                  Policy.
                </p>
              </>
            )}

            <p>
              Preparation Period
              begins:{" "}
              {agreementTime(
                agreement.preparationStartsAt,
              )}
              , once the booking is
              fully paid and clear.
            </p>

            <p>
              The event enters In
              Progress at its
              scheduled start when
              clear. The Provider
              confirms completion.
            </p>

            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={
                  acknowledged[
                    agreement.providerId
                  ] ===
                  agreement.agreementKey
                }
                onChange={(
                  event,
                ) =>
                  onChange(
                    agreement.providerId,
                    event.target
                      .checked
                      ? agreement.agreementKey
                      : null,
                  )
                }
              />

              I have reviewed and
              agree to the booking,
              payment, cancellation,
              and refund terms shown
              above.
            </label>
          </div>
        ),
      )}
    </section>
  );
}