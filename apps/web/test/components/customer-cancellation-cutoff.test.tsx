import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import type {CustomerBookingProviderRequest} from '@/lib/customer/bookings/customer-booking-types';
const mocks = vi.hoisted(() => ({options: vi.fn(), status: vi.fn(), submit: vi.fn()}));
vi.mock('@/lib/customer/bookings/customer-cancellation-client', () => ({
 getCustomerProviderRequestCancellationOptions: mocks.options,
 getCustomerProviderRequestCancellationStatus: mocks.status,
 submitCustomerProviderRequestCancellation: mocks.submit,
 createCustomerCancellationIdempotencyKey: () => 'attempt_cutoff',
}));
vi.mock('@/components/feedback/toast', () => ({feastaToast: {success: vi.fn(), error: vi.fn()}}));
import {CustomerCancellationAction} from '@/components/customer/bookings/customer-cancellation-action';
import {CustomerBookingCancellationDialog} from '@/components/customer/bookings/customer-booking-cancellation-dialog';
const request = {providerRequestId: 'request_cutoff', providerName: 'Test provider', services: [], type: 'catering', packageName: 'Service'} as unknown as CustomerBookingProviderRequest;
const allowed = {providerRequestId: 'request_cutoff', cancellationAllowed: true, reasonCode: 'LEGACY_MANUAL_REVIEW', eligibilityExpiresInMs: 1000, activeCancellation: null, policy: null, refundPreview: null};
const ended = {...allowed, cancellationAllowed: false, reasonCode: 'EVENT_ENDED', eligibilityExpiresInMs: 0};
beforeEach(() => {vi.clearAllMocks(); mocks.status.mockResolvedValue({providerRequestId: 'request_cutoff', cancellation: null});});
afterEach(() => {cleanup(); vi.useRealTimers();});
it('shows closure from the server and retains access to cancellation history', async () => {
 mocks.options.mockResolvedValue(ended);
 const onOpen = vi.fn();
 render(<CustomerCancellationAction providerRequestId="request_cutoff" providerName="Test provider" triggerId="cutoff" onOpen={onOpen} />);
 expect(await screen.findByText('Cancellation closed — event ended')).toBeVisible();
 fireEvent.click(screen.getByRole('button', {name: "Cancellation status for Test provider's service"}));
 expect(onOpen).toHaveBeenCalledOnce();
 expect(mocks.submit).not.toHaveBeenCalled();
});
it('rechecks control eligibility using server expiry even with a wildly incorrect device clock', async () => {
 vi.useFakeTimers(); vi.setSystemTime(new Date('2099-01-01'));
 mocks.options.mockResolvedValueOnce(allowed).mockResolvedValue(ended);
 await act(async () => {render(<CustomerCancellationAction providerRequestId="request_cutoff" providerName="Test provider" triggerId="cutoff" onOpen={vi.fn()} />);});
 expect(screen.getByRole('button', {name: "Cancellation options for Test provider's service"})).toBeEnabled();
 await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
 expect(screen.getByText('Cancellation closed — event ended')).toBeVisible();
});
it('invalidates an already-open dialog at server expiry and blocks submission', async () => {
 vi.useFakeTimers(); mocks.options.mockResolvedValueOnce(allowed).mockResolvedValue(ended);
 await act(async () => {render(<CustomerBookingCancellationDialog request={request} onClose={vi.fn()} />);});
 fireEvent.change(screen.getByRole('textbox', {name: /Cancellation reason/u}), {target: {value: 'Plans have changed'}});
 fireEvent.click(screen.getByRole('checkbox'));
 expect(screen.getByRole('button', {name: 'Submit cancellation request'})).toBeEnabled();
 await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
 expect(screen.getByText('Cancellation closed — event ended')).toBeVisible();
 expect(screen.getByRole('button', {name: 'Submit cancellation request'})).toBeDisabled();
 expect(mocks.submit).not.toHaveBeenCalled();
});
it('keeps the existing request visible after cutoff', async () => {
 const prior = {status: 'under_review', policyEvidenceStatus: 'legacy', frozenStage: null, manualReviewRequired: true,
   decisionStatus: 'pending', refund: {status: 'manual_review', amountInCentavos: null, completedAmountInCentavos: null, currency: null},
   submittedAt: '2026-10-17T01:00:00Z', updatedAt: '2026-10-17T01:00:00Z'};
 mocks.options.mockResolvedValue({...ended, activeCancellation: prior});
 mocks.status.mockResolvedValue({providerRequestId: 'request_cutoff', cancellation: prior});
 render(<CustomerBookingCancellationDialog request={request} onClose={vi.fn()} />);
 expect(await screen.findByText('Cancellation closed — event ended')).toBeVisible();
 expect(screen.getAllByText('Under review').length).toBeGreaterThan(0);
 expect(screen.getByRole('button', {name: 'Submit cancellation request'})).toBeDisabled();
});
it('failed expiry refresh keeps submission disabled', async () => {
 vi.useFakeTimers(); mocks.options.mockResolvedValueOnce(allowed).mockRejectedValue(new Error('Unavailable'));
 await act(async () => {render(<CustomerBookingCancellationDialog request={request} onClose={vi.fn()} />);});
 await act(async () => {await vi.advanceTimersByTimeAsync(1000);});
 expect(screen.getByRole('button', {name: 'Submit cancellation request'})).toBeDisabled();
 expect(screen.getByText('Cancellation eligibility could not be refreshed. Please try again.')).toBeVisible();
});
