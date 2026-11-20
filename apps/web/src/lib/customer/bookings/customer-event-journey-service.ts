import {scheduledEventWindow} from "@/lib/presentation/scheduled-event-window";
import 'server-only';
import {requireCustomer} from '@/lib/auth/session';
import {adminDb} from '@/lib/firebase/admin';
import {normalizeCanonicalProviderRequestIds, isCanonicalOwnedProviderRequest} from './customer-booking-membership';
import {eventStart, isJourneyConfirmed, journeyPolicy, stageLabels, type EventJourney} from './customer-event-journey';

export async function getCustomerEventJourney(): Promise<EventJourney | null> {
  const customer = await requireCustomer();
  const now = new Date();
  // Use the existing customer/status index, without a latest-created page cutoff.
  const events = await adminDb.collection('mainEvents').where('customerId', '==', customer.uid).where('status', 'in', ['confirmed', 'in_progress']).get();
  const candidates = events.docs.filter(doc => {
    const data = doc.data(), window = scheduledEventWindow(data);
    return data.customerId === customer.uid && ['confirmed', 'in_progress'].includes(String(data.status)) && data.isDeleted !== true && window !== null && now.getTime() < window.end;
  }).sort((a, b) => eventStart(a.data()) - eventStart(b.data()) || a.id.localeCompare(b.id));
  for (const event of candidates) {
    const data = event.data(), ids = normalizeCanonicalProviderRequestIds(data.providerRequestIds);
    if (!ids.length) continue;
    const requests = await adminDb.getAll(...ids.map(id => adminDb.collection('providerRequests').doc(id)));
    const owned = requests.filter(doc => doc.exists && isCanonicalOwnedProviderRequest({documentId: doc.id, storedProviderRequestId: doc.data()?.providerRequestId, mainEventId: doc.data()?.mainEventId, customerId: doc.data()?.customerId}, {mainEventId: event.id, customerId: customer.uid, canonicalProviderRequestIds: new Set(ids)}));
    const active = owned.filter(doc => doc.data()?.isDeleted !== true && isJourneyConfirmed(doc.data()!));
    if (!active.length) continue;
    const policies = active.map(doc => journeyPolicy(doc.data()!, now));
    const stage = Math.min(...policies.map(p => p.stage));
    const ongoing = now.getTime() >= eventStart(data);
    if (ongoing && stage < 3 && data.status !== 'in_progress') continue;
    const single = owned.length === 1 && active.length === 1;
    const rate = single ? policies[0].rate : null;
    return {id: event.id, title: String(data.eventType || 'Upcoming event').replace(/_/gu, ' ').replace(/\b\w/gu, c => c.toUpperCase()),
      when: new Intl.DateTimeFormat('en-PH', {timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'}).format(new Date(eventStart(data))),
      location: String(data.eventLocation || data.eventAddress || 'Location pending'), providers: active.map(doc => String(doc.data()?.providerBusinessName || doc.data()?.providerName || 'Event provider')).join(' · '),
      status: ongoing ? 'In progress' : stage === 2 ? 'Preparation' : 'Confirmed', stage, bannerTitle: ongoing ? 'Event in progress' : 'Your upcoming event',
      policyStage: !single ? 'Refund policies vary by provider' : rate === null ? 'Refund policy details unavailable' : stageLabels[stage - 1], rate, others: candidates.length > 1};
  }
  return null;
}
