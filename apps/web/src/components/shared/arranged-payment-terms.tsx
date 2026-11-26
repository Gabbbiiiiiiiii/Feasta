import type {ArrangedPaymentView} from "@/lib/payments/arranged-payment-view";

const currency = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
const dateTime = new Intl.DateTimeFormat("en-PH", {dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila"});

export function ArrangedPaymentTerms({offer}: {offer: ArrangedPaymentView}) {
  return (
    <dl className="grid gap-2 text-sm">
      <div>
        <dt className="font-semibold">First payment</dt>
        <dd>{currency.format(offer.upfrontInCentavos / 100)} due {dateTime.format(new Date(offer.initialDueAt))} (Manila time)</dd>
      </div>
      <div>
        <dt className="font-semibold">Remaining balance</dt>
        <dd>{currency.format((offer.grossInCentavos - offer.upfrontInCentavos) / 100)} due {dateTime.format(new Date(offer.balanceDueAt))} (Manila time)</dd>
      </div>
    </dl>
  );
}
