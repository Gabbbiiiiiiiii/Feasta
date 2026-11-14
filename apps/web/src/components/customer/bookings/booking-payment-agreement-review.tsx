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
      className="overflow-hidden rounded-[20px] border border-feasta-border-soft bg-white p-4 sm:p-5"
      aria-label="Booking & Payment Agreement"
    >
      <h3 className="text-lg font-extrabold tracking-tight text-foreground">Booking &amp; Payment Agreement</h3>

      <p className="mt-1 text-sm leading-6 text-feasta-text-secondary">These terms are calculated by FEASTA from your current booking. All times are in Asia/Manila.</p>

      {error && <p role="alert" className="mt-3 rounded-xl border border-destructive/20 bg-destructive-subtle p-3 text-sm text-destructive">{error}</p>}

      {!agreements.length && (
        <button type="button" onClick={onReload} className="mt-4 min-h-11 rounded-full border border-primary/20 bg-secondary px-4 py-2 text-sm font-bold text-primary-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">Review current booking agreement</button>
      )}

      {agreements.map(
        (agreement) => (
          <div
            key={
              agreement.providerId
            }
            className="mt-4 grid gap-4 rounded-[18px] border border-feasta-border-soft bg-feasta-canvas p-4 text-sm leading-6 sm:p-5 [&_p]:break-words"
          >
            <h4 className="break-words text-base font-extrabold text-foreground">
              {
                agreement.providerName
              }
            </h4>

            <div className="rounded-xl border border-primary/15 bg-secondary p-3">
              <p className="text-xs font-extrabold uppercase tracking-wide text-primary-strong">{agreement.depositEligible ? "Deposit option available" : "Full payment required"}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">Required upfront amount: <strong>{money(agreement.requiredUpfrontAmountInCentavos)}</strong></p>
              <p className="mt-1 text-xs leading-5 text-feasta-text-secondary">Shown for your current booking selection; the final payment requirements are validated on submission.</p>
            </div>
            <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-xl border border-feasta-border-soft bg-white p-4 [&_dt]:text-feasta-text-secondary [&_dd]:break-words [&_dd]:font-bold [&_dd]:text-foreground">
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
              <div className="rounded-xl bg-white px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-feasta-text-secondary">Deposit eligibility cutoff</p>
                <p className="mt-1 font-bold text-foreground">
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

                <h5 className="font-extrabold text-foreground">Failure to Pay Remaining Balance</h5>

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

                <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3 rounded-xl border border-feasta-border-soft bg-white p-4 [&_dt]:text-feasta-text-secondary [&_dd]:break-words [&_dd]:font-bold [&_dd]:text-foreground">
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

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary/20 bg-white p-4 font-medium leading-6 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
              <input
                type="checkbox"
                className="mt-1 size-5 shrink-0 accent-primary"
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