import Link from 'next/link';
import {ArrowRight, CalendarCheck, Check, Info} from 'lucide-react';
import {getCustomerEventJourney} from '@/lib/customer/bookings/customer-event-journey-service';
import type {EventJourney} from '@/lib/customer/bookings/customer-event-journey';
import {EventJourneyRefresh} from './event-journey-refresh';
export async function MarketplaceActiveEventStrip() {
  const journey = await getCustomerEventJourney().catch(() => null);
  return <><EventJourneyRefresh />{journey ? <EventJourneyBanner journey={journey} /> : null}</>;
}
export function EventJourneyBanner({journey}: {journey: EventJourney}) {
  const href = `/customer/bookings/${encodeURIComponent(journey.id)}`;
  return <section aria-labelledby="event-journey-title" className="min-w-0 rounded-3xl border border-feasta-border-strong bg-white p-4 shadow-[0_5px_20px_rgba(0,75,59,0.06)] sm:p-5">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="flex items-center gap-2 text-xs font-bold tracking-wide text-primary"><CalendarCheck aria-hidden="true" className="size-4 shrink-0" />{journey.bannerTitle ?? 'Your upcoming event'}</p>
        <h2 id="event-journey-title" className="mt-1 break-words text-xl font-bold leading-tight text-primary-strong">{journey.title}</h2>
        <p className="mt-1 text-sm text-feasta-text-secondary">{journey.when} · {journey.location}</p>
        <p className="mt-0.5 text-xs text-feasta-text-secondary">{journey.providers}</p>
      </div>
      <span className="max-w-[40%] shrink-0 rounded-full bg-primary-tint px-3 py-1.5 text-center text-xs font-bold text-primary">{journey.status}</span>
    </div>
    <div className="mt-3 border-t border-feasta-border-strong pt-2 sm:mt-2 sm:pt-1"><h3 className="text-sm font-bold text-primary-strong">Event journey</h3>
      <ol aria-label={`Event journey: ${journey.status}`} className="mt-1 grid grid-cols-4">
        {['Accepted', 'Confirmed', 'Preparation', 'Event day'].map((label, index) => <li key={label} aria-current={index === journey.stage ? 'step' : undefined} className="relative min-w-0 text-center">
          <div aria-hidden="true" className={`absolute inset-x-0 top-3 h-1 motion-safe:transition-colors ${index <= journey.stage ? 'bg-primary' : 'bg-feasta-border-strong'}`} />
          <span className={`relative mx-auto grid size-7 place-items-center rounded-full border-[3px] ring-4 ring-white motion-safe:transition-colors ${index <= journey.stage ? 'border-primary bg-primary text-white' : 'border-feasta-border-strong bg-white'}`}>{index <= journey.stage ? <Check aria-hidden="true" className="size-4" /> : null}</span>
          <span className={`relative mt-0.5 block break-words px-0.5 text-[11px] leading-4 sm:text-xs ${index <= journey.stage ? 'font-bold text-primary-strong' : 'text-feasta-text-secondary'}`}>{label}<span className="sr-only">{index <= journey.stage ? ', reached' : ', upcoming'}</span></span>
        </li>)}
      </ol>
    </div>
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-primary-tint px-3 py-2.5 sm:mt-2 sm:px-4 sm:py-2">
      <div className="min-w-0"><p className="text-[10px] font-semibold leading-4 tracking-wide text-feasta-text-secondary sm:text-xs">CURRENT REFUND-POLICY STAGE</p><p className="mt-0.5 text-base font-bold leading-6 text-primary-strong sm:text-lg">{journey.policyStage}</p>
        <p className="mt-0.5 text-xs leading-4 text-feasta-text-secondary">The rate applies to eligible payments. Your actual refund is calculated when you request cancellation.</p>
        {journey.rate === null ? <Link className="mt-1 inline-flex min-h-11 items-center text-xs font-bold text-primary underline focus-visible:outline-2 sm:min-h-0 sm:py-1" href={href}>View policies</Link> : null}
      </div>
      {journey.rate !== null ? <div className="shrink-0 text-center sm:border-l sm:border-feasta-border-strong sm:pl-4"><p className="text-3xl font-bold leading-none text-primary sm:text-4xl">{journey.rate}</p><p className="mt-0.5 text-xs text-feasta-text-secondary">Policy rate</p></div> : null}
    </div>
    <footer className="mt-3 flex flex-col gap-2 border-t border-feasta-border-strong pt-2 sm:mt-2 sm:pt-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1"><p className="flex items-center gap-2 text-xs text-feasta-text-secondary"><Info aria-hidden="true" className="size-4 shrink-0" />Your event updates at a glance.</p>{journey.others ? <Link href="/customer/bookings" className="inline-flex min-h-11 items-center text-xs font-bold text-primary underline sm:min-h-0 sm:py-1">View other bookings</Link> : null}</div>
      <Link href={href} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto">View booking details <ArrowRight aria-hidden="true" className="size-4" /></Link>
    </footer>
  </section>;
}
