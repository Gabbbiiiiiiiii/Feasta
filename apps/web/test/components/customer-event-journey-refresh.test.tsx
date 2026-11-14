import {render, act, cleanup} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({useRouter: () => ({refresh})}));
import {EventJourneyRefresh} from '@/components/customer/discovery/event-journey-refresh';
afterEach(() => {cleanup(); vi.useRealTimers(); refresh.mockClear();});
it('refreshes visible pages at one minute and cleans up on navigation', () => {
 vi.useFakeTimers();
 const {unmount} = render(<EventJourneyRefresh />);
 act(() => vi.advanceTimersByTime(59_999)); expect(refresh).not.toHaveBeenCalled();
 act(() => vi.advanceTimersByTime(1)); expect(refresh).toHaveBeenCalledTimes(1);
 unmount(); act(() => vi.advanceTimersByTime(60_000)); expect(refresh).toHaveBeenCalledTimes(1);
});
it('throttles focus refreshes and skips hidden tabs', () => {
 vi.useFakeTimers(); render(<EventJourneyRefresh />);
 act(() => window.dispatchEvent(new Event('focus'))); expect(refresh).not.toHaveBeenCalled();
 act(() => vi.advanceTimersByTime(30_000)); act(() => window.dispatchEvent(new Event('focus'))); expect(refresh).toHaveBeenCalledTimes(1);
 const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
 act(() => vi.advanceTimersByTime(120_000)); expect(refresh).toHaveBeenCalledTimes(1);
 visible.mockReturnValue('visible'); act(() => document.dispatchEvent(new Event('visibilitychange'))); expect(refresh).toHaveBeenCalledTimes(2);
});
