import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {ProviderBookingStatus} from '@/components/provider/provider-booking-status';
import {bookingPolicyV3Presentation} from '@/lib/payments/booking-policy-v3-presentation';
import {scheduledEventWindow} from '@/lib/presentation/scheduled-event-window';
import type {ProviderBooking} from '@/lib/provider/bookings/provider-booking-types';
const start = '2026-10-16T10:00:00Z';
const raw = {status: 'in_progress', remainingBalanceTimingSchemaVersion: 3, balanceDueHoursBeforeEvent: 48,
 eventStartAt: start, eventDate: start, eventTime: '18:00', eventEndTime: '20:00',
 remainingBalanceDueAt: '2026-10-14T10:00:00Z', hardPaymentDeadlineAt: '2026-10-15T10:00:00Z', preparationStartsAt: '2026-10-15T10:00:00Z',
 bookingLifecyclePolicySnapshot: {schemaVersion: 3, providerStartsManually: false, requiresFullPayment: true, autoStartAtScheduledTime: true, providerConfirmsCompletion: true},
 settlementStatus: 'fully_settled', outstandingAmountInCentavos: 0};
function booking(status = 'in_progress') {return {providerRequestStatus: status, mainEventStatus: status, eventDate: start, eventTime: '18:00', eventEndTime: '20:00',
 bookingPolicy: bookingPolicyV3Presentation({...raw, status}, new Date('2026-10-16T11:00:00Z'))} as ProviderBooking;}
afterEach(() => {cleanup(); vi.useRealTimers();});
it.each([
 ['2026-10-16T09:59:59Z', 'upcoming'], ['2026-10-16T10:00:00Z', 'in_progress'],
 ['2026-10-16T11:59:59Z', 'in_progress'], ['2026-10-16T12:00:00Z', 'awaiting_completion'],
 ['2026-10-17T12:00:00Z', 'awaiting_completion'],
])('projects boundary %s without completing canonical status', (at, state) => {
 const original = structuredClone(raw);
 expect(bookingPolicyV3Presentation(raw, new Date(at))?.state).toBe(state);
 expect(raw).toEqual(original);
});
it('updates open status at scheduled end and renders canonical completion afterward', () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T11:59:59Z'));
 const data = booking(); const {rerender} = render(<ProviderBookingStatus booking={data} />);
 expect(screen.getByLabelText('Status: In progress')).toBeInTheDocument();
 act(() => vi.advanceTimersByTime(1000));
 expect(screen.getByLabelText('Status: Awaiting completion')).toBeInTheDocument();
 expect(data.providerRequestStatus).toBe('in_progress');
 rerender(<ProviderBookingStatus booking={booking('completed')} />);
 expect(screen.getByLabelText('Status: Completed')).toBeInTheDocument();
});
it('supports overnight Manila schedules and rejects disagreement', () => {
 const overnight = {...raw, eventTime: '22:00', eventEndTime: '01:00', eventStartAt: '2026-10-16T14:00:00Z'};
 expect(scheduledEventWindow(overnight)).toEqual({start: Date.parse('2026-10-16T14:00:00Z'), end: Date.parse('2026-10-16T17:00:00Z')});
 expect(scheduledEventWindow({...overnight, eventStartAt: start})).toBeNull();
});
it.each(['25:00', 'invalid', null])('does not infer completion from invalid clock %s', eventEndTime => {
 expect(bookingPolicyV3Presentation({...raw, eventEndTime}, new Date('2026-10-17T12:00:00Z'))?.readyToComplete).toBe(false);
});
