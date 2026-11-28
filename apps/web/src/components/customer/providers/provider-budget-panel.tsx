"use client";

import {ArrowRight, ImageIcon, Sparkles} from "lucide-react";
import Link from "next/link";
import {useEffect, useRef, useState} from "react";
import {AddToEventListButton} from "@/components/customer/event-list/add-to-event-list-button";
import {EditEventFinderButton} from "./edit-event-finder-button";
import {Button} from "@/components/ui/button";
import {Select} from "@/components/ui/select";
import {chooseBudgetOffers, type BudgetOffer} from "@/lib/customer/providers/provider-budget-fit";

const pesos = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
const price = (cents: number) => pesos.format(cents / 100);

function OfferPhoto({offer, className}: {offer: BudgetOffer; className: string}) {
  return <div className={`relative grid place-items-center overflow-hidden rounded-xl bg-secondary text-primary-strong ${className}`}>
    {offer.imageUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={offer.imageUrl} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
    ) : <ImageIcon aria-hidden="true" className="size-6 opacity-60" />}
  </div>;
}

export function ProviderBudgetPanel({cap, categories, offers, status, incompleteCatalog, updating = false, city, guestCount, editHref, sessionKey, eventDetails = [], reviewOnly = false, resultsHref, reviewHref}: {
  cap: number;
  categories: readonly {code: string; name: string; unavailable?: boolean; venueUnconfirmed?: boolean; browseHref?: string}[];
  offers: readonly BudgetOffer[];
  status: "ready" | "checking" | "error" | "details" | "sign-in";
  incompleteCatalog: boolean;
  updating?: boolean;
  city?: string;
  guestCount?: number;
  editHref?: string;
  sessionKey?: string;
  eventDetails?: readonly string[];
  reviewOnly?: boolean;
  resultsHref?: string;
  reviewHref?: string;
}) {
  const [inlineReview, setReviewing] = useState(false);
  const reviewing = reviewOnly || inlineReview;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (reviewing) heading.current?.focus();
  }, [reviewing]);

  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const storageKey = sessionKey ? `feasta:best-fit:choices:${sessionKey}` : null;
  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "{}");
      if (saved && typeof saved === "object") setReplacements(saved);
    } catch {}
  }, [storageKey]);

  function updateReplacements(next: Record<string, string>) {
    setReplacements(next);
    if (storageKey) {
      try { sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
    }
  }
  const initial = chooseBudgetOffers(offers, cap);
  const selections = new Map(initial);
  for (const offer of offers) {
    if (replacements[offer.category] === offer.key) {
      const currentTotal = [...selections.values()].reduce((sum, item) => sum + item.cents, 0);
      if (currentTotal - (selections.get(offer.category)?.cents ?? 0) + offer.cents <= cap) {
        selections.set(offer.category, offer);
      }
    }
  }
  const total = [...selections.values()].reduce((sum, offer) => sum + offer.cents, 0);
  const remaining = cap - total;
  const matched = categories.flatMap((category) => {
    const picked = selections.get(category.code);
    return picked ? [{category, picked}] : [];
  });
  const unmatched = categories.filter(({code}) => !selections.has(code));

  if (reviewing && status === "ready" && matched.length) {
    const packages = matched.filter(({picked}) => picked.href.startsWith("/customer/packages/"));
    const booking = packages.length === 1 ? packages[0].picked : undefined;
    return <section aria-labelledby="best-fit-review-title" className="space-y-5">
      {resultsHref ? <Button variant="ghost" asChild><Link href={resultsHref}>← Back to Best Fit Recommendations</Link></Button> : <Button variant="ghost" onClick={() => setReviewing(false)}>← Back to Best Fit Recommendations</Button>}
      <h2 id="best-fit-review-title" ref={heading} tabIndex={-1} className="text-2xl font-bold text-primary-strong">Review &amp; confirm your custom event request</h2>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          <h3 className="text-xl font-bold">Primary details</h3>
          <p className="rounded-xl border border-border bg-primary/5 p-3 text-sm">Review and accept the provider’s booking and refund terms in the booking flow before submitting.</p>
          {matched.map(({category, picked}) => <div key={category.code}
            className="grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 rounded-2xl border border-border bg-card p-3 sm:grid-cols-[5rem_minmax(0,1fr)_auto]">
            <OfferPhoto offer={picked} className="h-20" />
            <div className="min-w-0">
              <h4 className="font-bold">{category.name}</h4>
              <p className="break-words text-sm">{picked.name}</p>
              <p className="text-sm text-muted-foreground">{picked.provider}</p>
            </div>
            <Link href={picked.href} className="col-start-2 text-sm font-semibold text-primary-strong underline-offset-4 hover:underline sm:col-start-auto">
              {picked.href.startsWith("/customer/packages/") ? "View & customize package" : "View provider"}
            </Link>
          </div>)}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <h3 className="text-xl font-bold">Event details</h3>
            <EditEventFinderButton />
          </div>
          <ul className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs">
            {[...eventDetails, city].filter(Boolean).map((detail) =>
              <li key={detail} className="rounded-full bg-secondary px-2.5 py-1 leading-tight">{detail}</li>)}
          </ul>
        </div>
        <div className="space-y-3">
          <h3 className="text-xl font-bold">Estimate &amp; submit</h3>
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <h4 className="font-bold">Booking estimate</h4>
            <p className="text-sm text-muted-foreground">Review the displayed cost before submission.</p>
            <dl className="divide-y divide-border border-t border-border">
              {matched.map(({category, picked}) => <div key={category.code} className="flex justify-between gap-3 py-3 text-sm">
                <dt>{category.name} ({picked.provider})</dt><dd className="shrink-0 font-semibold">{price(picked.cents)}</dd>
              </div>)}
              <div className="flex justify-between gap-3 py-3 font-bold text-primary-strong"><dt>Estimated total</dt><dd>{price(total)}</dd></div>
            </dl>
            <p className="rounded-xl bg-secondary p-3 text-sm">FEASTA checks pricing and availability before submission. No payment is collected now.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {resultsHref ? <Button variant="ghost" asChild><Link href={resultsHref}>← Back</Link></Button> : <Button variant="ghost" onClick={() => setReviewing(false)}>← Back</Button>}
            {booking?.eventListItem && <AddToEventListButton className="!w-auto" item={booking.eventListItem} label="Add to Event List" />}
            {booking && <Button asChild><Link href={booking.href}>Submit booking request <ArrowRight aria-hidden="true" className="size-4" /></Link></Button>}
          </div>
        </div>
      </div>
    </section>;
  }

  if (reviewOnly) return <section className="space-y-3">
    <Link href={resultsHref ?? "/customer/providers"}>← Back to Best Fit Recommendations</Link>
    <p role="status">{status === "checking" ? "Loading your Best Fit selections…" : "No selections are available to review. Return to Best Fit to choose an offer."}</p>
  </section>;

  return <section aria-labelledby="budget-fit-title" className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 id="budget-fit-title" className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-primary-strong">
          Best Fit recommendations <Sparkles aria-hidden="true" className="size-5 text-warning" />
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Based on your <strong className="text-foreground">{price(cap)}</strong> maximum budget.
          {status === "ready" && ` ${matched.length} of ${categories.length} services matched on this page.`}
        </p>
      </div>
      {status === "ready" && matched.length > 1 && <nav aria-label="Matching services" className="flex flex-wrap gap-2">
        {matched.map(({category}) => <a key={category.code} href={`#best-fit-${category.code}`}
          className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-primary-strong hover:bg-secondary">
          {category.name}
        </a>)}
      </nav>}
      {updating && <span role="status" className="text-xs text-muted-foreground">Updating…</span>}
    </header>
    <div className="overflow-hidden rounded-[22px] border border-feasta-border-soft bg-card">
      {status !== "ready" ? <p role="status" className="p-5 text-sm">
        {status === "checking" ? "Checking availability for your event…" :
          status === "details" ? "Add an occasion, venue, schedule, and guest count to get estimates." :
          status === "sign-in" ? "Sign in with a verified customer account to check availability." :
          "Availability could not be confirmed. Try the availability check again."}
      </p> : <div inert={updating} className={updating ? "opacity-70" : undefined}>
        <div className="grid gap-3 p-4 sm:p-5">
          {incompleteCatalog && <p role="status" className="text-sm text-muted-foreground">Some offers could not be loaded. These results may be incomplete.</p>}
          <div className="grid gap-5 xl:grid-cols-2">
          {matched.map(({category, picked}) => {
            const options = offers.filter((offer) => offer.category === category.code);
            const availableBudget = remaining + picked.cents;
            const affordable = options.filter((offer) => offer.cents <= availableBudget);
            const alternatives = affordable.filter((offer) => offer.key !== picked.key);
            const isPackage = picked.href.startsWith("/customer/packages/");
            return <section key={category.code} id={`best-fit-${category.code}`} className={`min-w-0 scroll-mt-28 space-y-3 ${matched.length < 3 || category.code === "catering_service" ? "xl:col-span-2" : ""}`}>
              <h3 className="text-base font-bold">{category.name} <span className="font-normal text-muted-foreground">({affordable.length} within budget)</span></h3>
              <div className="grid gap-4 rounded-2xl border border-primary/40 bg-card p-3 shadow-sm sm:grid-cols-[minmax(9rem,1fr)_2fr]">
              <OfferPhoto offer={picked} className="min-h-36" />
              <div className="min-w-0 py-1">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  {initial.get(category.code)?.key === picked.key && <span className="mb-2 inline-flex rounded-full bg-warning-subtle px-2.5 py-1 text-xs font-semibold text-primary-strong">Top match</span>}
                  <h3 className="text-lg font-bold">{category.name}</h3>
                  <Link href={picked.href} className="break-words text-sm text-primary-strong underline">{picked.provider} · {picked.name}</Link>
                </div>
                <strong className="text-lg tabular-nums text-primary-strong">{price(picked.cents)}</strong>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <div className="flex flex-wrap gap-2 text-xs">
                  {city && <span className="rounded-full bg-secondary px-2.5 py-1">Matches {city}</span>}
                  {isPackage && guestCount && <span className="rounded-full bg-secondary px-2.5 py-1">Fits {guestCount} guests</span>}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {alternatives.length > 0 && <Select
                    aria-label={`Replace ${category.name}`} value="" className="max-w-full sm:w-56"
                    onChange={(event) => updateReplacements({...replacements, [category.code]: event.target.value})}>
                    <option value="" disabled>Replace option</option>
                    {alternatives.map((offer) => <option key={offer.key} value={offer.key}>
                      {offer.provider} · {offer.name} · {price(offer.cents)}
                    </option>)}
                  </Select>}
                  <Button asChild size="compact" className="rounded-full">
                    <Link href={picked.href}>{isPackage ? "View & customize package" : "View provider"}<ArrowRight aria-hidden="true" className="size-4" /></Link>
                  </Button>
                </div>
              </div>
              </div>
              </div>
              {alternatives.length > 0 && <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Other matching offers</h4>
                <ul className="grid auto-cols-[min(100%,19rem)] grid-flow-col gap-3 overflow-x-auto pb-2">
                  {alternatives.map((offer) => <li key={offer.key} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3 rounded-2xl border border-border bg-card p-3">
                    <OfferPhoto offer={offer} className="min-h-20" />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold">{offer.provider}</p>
                      <p className="break-words text-xs text-muted-foreground">{offer.name}</p>
                      <p className="my-1 text-sm font-bold text-primary-strong">{price(offer.cents)}</p>
                      <Button type="button" variant="secondary" size="compact" className="rounded-full"
                        aria-label={`Choose ${offer.name} from ${offer.provider}`}
                        onClick={() => updateReplacements({...replacements, [category.code]: offer.key})}>
                        {offer.href.startsWith("/customer/packages/") ? "Choose package" : "Choose service"}
                      </Button>
                    </div>
                  </li>)}
                </ul>
              </div>}
            </section>;
          })}
          </div>
          {unmatched.length > 0 && <div className="grid gap-3 sm:grid-cols-2">
            {unmatched.map(({code, name, unavailable, venueUnconfirmed, browseHref}) => {
              const first = offers.find((offer) => offer.category === code);
              return <section key={code} className="min-w-0 rounded-2xl border border-border p-3">
                <h3 className="font-semibold">{name}</h3>
                <p className="my-2 rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">{first
                  ? `Lowest verified estimate is ${price(first.cents)}, which exceeds your remaining budget.`
                  : unavailable ? "Providers on this page are unavailable for your event."
                    : venueUnconfirmed ? `No confirmed service area for ${city || "your venue"}.`
                      : "No published offer on this page met the event and pricing requirements."}</p>
                {browseHref && <Link href={browseHref} className="inline-flex items-center gap-2 text-sm font-semibold text-primary-strong underline-offset-4 hover:underline">
                  Browse {name.toLowerCase()} <ArrowRight aria-hidden="true" className="size-4" />
                </Link>}
              </section>;
            })}
          </div>}
        </div>
        <footer className="space-y-3 border-t border-border bg-muted/40 p-4 sm:p-5">
          <dl aria-live="polite" className="flex flex-wrap justify-between gap-x-4 gap-y-2 text-sm">
            <div><dt>Total estimate</dt><dd className="text-lg font-bold text-primary-strong">{price(total)}</dd></div>
            <div><dt>Remaining budget</dt><dd className="text-lg font-bold">{price(remaining)}</dd></div>
          </dl>
          {matched.length > 1 && <ul aria-label="Selected cost breakdown" className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {matched.map(({category, picked}) => <li key={category.code}>{category.name} · {price(picked.cents)}</li>)}
          </ul>}
          <progress aria-label="Estimated budget used" value={total} max={cap}
            className="block h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary" />
          <div className="flex flex-wrap justify-end gap-2">
            {editHref && <Button asChild variant="secondary" size="compact" className="rounded-full">
              <Link href={editHref} onClick={() => updateReplacements({})}>Restore default suggestions</Link>
            </Button>}
            {matched.length > 0 && (reviewHref ? <Button asChild size="compact" className="rounded-full">
              <Link href={reviewHref}>Continue <ArrowRight aria-hidden="true" className="size-4" /></Link>
            </Button> : <Button type="button" size="compact" className="rounded-full" onClick={() => setReviewing(true)}>
              Continue <ArrowRight aria-hidden="true" className="size-4" />
            </Button>)}
          </div>
        </footer>
      </div>}
    </div>
  </section>;
}
