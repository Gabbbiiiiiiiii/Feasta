import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {renderToString} from 'react-dom/server';
import {BookingLifecycleStatus, BookingLifecycleNotice} from '@/components/shared/booking-lifecycle-status';
import {lifecycleEvidence, lifecycleLabel, linkedLifecycleEvidence, ENDED_REVIEW_MESSAGE} from '@/lib/presentation/booking-lifecycle';
import {ProviderBookingStatus} from '@/components/provider/provider-booking-status';
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
 expect(lifecycleLabel('in_progress',lifecycleEvidence({...raw,lifecycleReconciliationRequired:true}),now)).toBe('Booking review required');
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
it('renders the exact ended reconciliation explanation without claiming cancellation', () => {
 vi.useFakeTimers();vi.setSystemTime(end+1);
 render(<BookingLifecycleNotice status="in_progress" evidence={lifecycleEvidence({...raw,lifecycleReconciliationRequired:true})}/>);
 expect(screen.getByText('Booking review required')).toBeVisible();expect(screen.getByText(ENDED_REVIEW_MESSAGE)).toBeVisible();
 expect(screen.queryByText(/cancellation/i)).not.toBeInTheDocument();
});
