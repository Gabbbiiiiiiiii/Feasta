import {act, cleanup, render, renderHook, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {renderToString} from 'react-dom/server';
import {BookingLifecycleStatus, BookingLifecycleNotice, BookingLifecycleText} from '@/components/shared/booking-lifecycle-status';
import {lifecycleEvidence, lifecycleLabel, linkedLifecycleEvidence, BOOKING_REVIEW_MESSAGE, ENDED_REVIEW_MESSAGE} from '@/lib/presentation/booking-lifecycle';
import {ProviderBookingStatus, useProviderBookingPresentation} from '@/components/provider/provider-booking-status';
import type {BookingPolicyPresentation} from '@/lib/payments/booking-policy-v3-presentation';
import type {ProviderBooking} from '@/lib/provider/bookings/provider-booking-types';
const raw = {eventDate:'2026-10-17T00:00:00Z', eventTime:'08:14', eventEndTime:'18:14'};
const end = Date.parse('2026-10-17T10:14:00Z');
afterEach(() => {cleanup(); vi.useRealTimers();});
it('separates reconciliation, refund execution and cancellation without inferring from status', () => {
 expect(lifecycleEvidence({...raw, status:'cancelled'}).cancellation).toBe(false);
 for(const patch of [{lifecycleReconciliationRequired:true},{reconciliationRequired:true},{refundExecutionLock:{}},{remainingBalanceEnforcement:{status:'reconciliation_required'}}]) {
  expect(lifecycleEvidence({...raw,...patch})).toEqual({cancellation:false,reconciliation:true,end});
 }
 for(const patch of [{activeCancellationRequestId:'cancel'},{approvedCancellationRequestId:'cancel'},{refundEligibilityState:{activeCancellationRequestId:'cancel'}}]) expect(lifecycleEvidence(patch).cancellation).toBe(true);
});
it.each(['completed','cancelled','expired'])('canonical %s takes precedence over every blocker', status => {
 expect(lifecycleLabel(status,{cancellation:true,reconciliation:true,end},end+1)).toBeNull();
});
it.each([end-36_000_001,end-1,end,end+86_400_000])('projects trusted boundary %s', now => {
 expect(lifecycleLabel('in_progress',lifecycleEvidence(raw),now)).toBe(now>=end?'Awaiting completion':null);
 expect(lifecycleLabel('in_progress',lifecycleEvidence({...raw,lifecycleReconciliationRequired:true}),now)).toBe(now>=end?'Completion on hold':'Booking review required');
});
it.each([end-1,end,end+86_400_000])('keeps a cancellation hold as booking review at %s, even with reconciliation', now => {
 for(const patch of [{activeCancellationRequestId:'cancel'},{activeCancellationRequestId:'cancel',lifecycleReconciliationRequired:true}])
  expect(lifecycleLabel('in_progress',lifecycleEvidence({...raw,...patch}),now)).toBe('Booking review required');
});
it('holds completion for ended bookings with provider-level reconciliation or incomplete linked evidence', () => {
 const parent=lifecycleEvidence(raw), clear={status:'in_progress',lifecycle:lifecycleEvidence(raw)};
 const providerLevel={status:'in_progress',lifecycle:lifecycleEvidence({...raw,lifecycleReconciliationRequired:true})};
 expect(lifecycleLabel('in_progress',linkedLifecycleEvidence(parent,[clear]),end)).toBe('Awaiting completion');
 expect(lifecycleLabel('in_progress',linkedLifecycleEvidence(parent,[clear,providerLevel]),end)).toBe('Completion on hold');
 expect(lifecycleLabel('in_progress',linkedLifecycleEvidence(parent,[clear],2),end)).toBe('Completion on hold');
 expect(lifecycleLabel('in_progress',linkedLifecycleEvidence(parent,[],1),end)).toBe('Completion on hold');
 expect(lifecycleLabel('completed',linkedLifecycleEvidence(parent,[clear,providerLevel],3),end)).toBeNull();
});
it('inspects all active linked requests and preserves parent and terminal precedence', () => {
 const parent=lifecycleEvidence(raw), clear={status:'in_progress',lifecycle:lifecycleEvidence(raw)}, blocked={...clear,lifecycle:lifecycleEvidence({...raw,lifecycleReconciliationRequired:true})};
 expect(linkedLifecycleEvidence(parent,[clear,blocked]).reconciliation).toBe(true);
 expect(linkedLifecycleEvidence(parent,[clear,{...blocked,status:'completed'}]).reconciliation).toBe(false);
 expect(linkedLifecycleEvidence(parent,[clear],2).reconciliation).toBe(true);
 expect(lifecycleLabel('completed',linkedLifecycleEvidence(parent,[blocked]),end)).toBeNull();
});
it('uses Manila overnight end and rejects disagreeing start evidence', () => {
 expect(lifecycleEvidence({...raw,eventTime:'22:00',eventEndTime:'01:00'}).end).toBe(Date.parse('2026-10-17T17:00:00Z'));
 expect(lifecycleEvidence({...raw,eventStartAt:'2026-10-17T03:00:00Z'}).end).toBeNull();
});
it('hydrates deterministically then updates customer/provider and desktop/mobile at the boundary', () => {
 vi.useFakeTimers();vi.setSystemTime(end-1);
 const evidence=lifecycleEvidence(raw);
 const booking={...raw, providerRequestStatus:'in_progress',mainEventStatus:'in_progress', lifecycle:evidence} as unknown as ProviderBooking;
 const node=<><BookingLifecycleStatus status="in_progress" evidence={evidence}/><BookingLifecycleStatus status="in_progress" evidence={evidence}/><ProviderBookingStatus booking={booking}/><ProviderBookingStatus booking={booking}/></>;
 expect(renderToString(node)).toContain('Status: In progress');
 render(node);expect(screen.getAllByLabelText('Status: In progress')).toHaveLength(4);
 act(()=>vi.advanceTimersByTime(1));expect(screen.getAllByLabelText('Status: Awaiting completion')).toHaveLength(4);
 expect(booking.providerRequestStatus).toBe('in_progress');
});
it('renders the exact ended completion-hold explanation without claiming cancellation', () => {
 vi.useFakeTimers();vi.setSystemTime(end+1);
 const evidence=lifecycleEvidence({...raw,lifecycleReconciliationRequired:true});
 render(<><BookingLifecycleNotice status="in_progress" evidence={evidence}/><p data-testid="description"><BookingLifecycleText status="in_progress" evidence={evidence} description>fallback</BookingLifecycleText></p></>);
 expect(screen.getByText('Completion on hold')).toBeVisible();expect(screen.getAllByText(ENDED_REVIEW_MESSAGE)).toHaveLength(2);
 expect(ENDED_REVIEW_MESSAGE).toMatch(/must verify the booking's completion records before marking it completed/u);
 expect(screen.queryByText('Booking review required')).not.toBeInTheDocument();
 expect(screen.queryByText(/cancellation/i)).not.toBeInTheDocument();
});
it('keeps ended cancellation holds out of the completion-hold wording', () => {
 vi.useFakeTimers();vi.setSystemTime(end+1);
 render(<BookingLifecycleNotice status="in_progress" evidence={lifecycleEvidence({...raw,activeCancellationRequestId:'cancel'})}/>);
 expect(screen.getByText('Booking review required')).toBeVisible();expect(screen.getByText(BOOKING_REVIEW_MESSAGE)).toBeVisible();
 expect(screen.queryByText('Completion on hold')).not.toBeInTheDocument();
});
const policy=(patch: Partial<BookingPolicyPresentation>={}): BookingPolicyPresentation => ({label:'In Progress',state:'in_progress',eventAt:'2026-10-17T00:14:00.000Z',dueAt:'',deadlineAt:'',preparationAt:'',remainingAmountInCentavos:0,readyToComplete:false,allocation:null,...patch});
const providerBooking=(lifecycle: ReturnType<typeof lifecycleEvidence>, patch: Partial<ProviderBooking>={}) => ({...raw,providerRequestStatus:'in_progress',mainEventStatus:'in_progress',automaticLifecycle:true,canCompleteEvent:true,lifecycle,bookingPolicy:policy(),...patch}) as unknown as ProviderBooking;
it('never exposes provider completion while completion is on hold or under review', () => {
 vi.useFakeTimers();vi.setSystemTime(end+1);
 const held=renderHook(()=>useProviderBookingPresentation(providerBooking(lifecycleEvidence({...raw,lifecycleReconciliationRequired:true})))).result.current;
 expect(held?.bookingPolicy).toMatchObject({state:'review',label:'Completion on hold',completionHold:true,endedReview:true,explanation:ENDED_REVIEW_MESSAGE,readyToComplete:false});
 const cancelling=renderHook(()=>useProviderBookingPresentation(providerBooking(lifecycleEvidence({...raw,activeCancellationRequestId:'cancel'})))).result.current;
 expect(cancelling?.bookingPolicy).toMatchObject({state:'review',label:'Booking review required',completionHold:false,readyToComplete:false});
 for(const state of ['review','hold'] as const) {
  const serverHeld=renderHook(()=>useProviderBookingPresentation(providerBooking(lifecycleEvidence(raw),{bookingPolicy:policy({state,label:'Payment review required'})}))).result.current;
  expect(serverHeld?.bookingPolicy).toMatchObject({state,label:'Payment review required',readyToComplete:false});
 }
 const denied=renderHook(()=>useProviderBookingPresentation(providerBooking(lifecycleEvidence(raw),{canCompleteEvent:false}))).result.current;
 expect(denied?.bookingPolicy).toMatchObject({state:'awaiting_completion',label:'Awaiting completion',readyToComplete:false});
 const clear=renderHook(()=>useProviderBookingPresentation(providerBooking(lifecycleEvidence(raw)))).result.current;
 expect(clear?.bookingPolicy).toMatchObject({state:'awaiting_completion',label:'Awaiting completion',readyToComplete:true});
 expect(clear?.providerRequestStatus).toBe('in_progress');
});
