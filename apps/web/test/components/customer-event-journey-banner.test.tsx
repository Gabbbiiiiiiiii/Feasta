import {render, screen, cleanup} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
vi.mock('@/lib/customer/bookings/customer-event-journey-service', () => ({getCustomerEventJourney: vi.fn()}));
vi.mock('@/components/customer/discovery/event-journey-refresh', () => ({EventJourneyRefresh: () => null}));
import {EventJourneyBanner} from '@/components/customer/discovery/marketplace-active-event-strip';
import type {EventJourney} from '@/lib/customer/bookings/customer-event-journey';
const journey: EventJourney = {id: 'event123', title: 'Birthday Celebration', when: 'Oct 25, 2026, 9:00 AM', location: 'Ormoc City', providers: 'My caterer', status: 'Confirmed', stage: 1, policyStage: 'Preparation not started', rate: '100%', others: true};
afterEach(cleanup);
it('renders real event metadata and accessible connected milestones with direct navigation', () => {
 render(<EventJourneyBanner journey={journey} />);
 expect(screen.getByRole('region', {name: 'Birthday Celebration'})).toBeInTheDocument();
 expect(screen.getByText('My caterer')).toBeInTheDocument();
 expect(screen.getByText(/Oct 25, 2026/)).toHaveTextContent('Ormoc City');
 expect(screen.getByRole('list')).toHaveAccessibleName('Event journey: Confirmed');
 expect(screen.getAllByRole('listitem')).toHaveLength(4);
 expect(screen.getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step');
 expect(screen.getByRole('link', {name: 'View booking details'})).toHaveAttribute('href', '/customer/bookings/event123');
 expect(screen.getByText('100%')).toBeInTheDocument();
 expect(screen.getByRole('link', {name: 'View other bookings'})).toHaveAttribute('href', '/customer/bookings');
});
it.each(['Refund policy details unavailable', 'Refund policies vary by provider'])('shows safe fallback %s', policyStage => {
 render(<EventJourneyBanner journey={{...journey, rate: null, policyStage}} />);
 expect(screen.queryByText('100%')).not.toBeInTheDocument();
 expect(screen.getByRole('link', {name: 'View policies'})).toHaveAttribute('href', '/customer/bookings/event123');
});
it('keeps four stages in a responsive grid and restricts transitions to motion-safe', () => {
 const {container} = render(<EventJourneyBanner journey={journey} />);
 expect(screen.getByRole('list')).toHaveClass('grid-cols-4');
 expect(container.querySelector('.motion-safe\\:transition-colors')).toBeTruthy();
 expect(screen.getByRole('link', {name: 'View booking details'})).toHaveClass('min-h-11');
});
it('uses compact natural sizing and a full-width mobile action', () => {
 const {container} = render(<EventJourneyBanner journey={journey} />);
 const card = screen.getByRole('region', {name: journey.title});
 expect(card).toHaveClass('p-4', 'sm:p-5');
 expect(card.className).not.toMatch(/(?:^|\s)(?:min-h-|h-)/u);
 expect(container.querySelectorAll('span.size-7')).toHaveLength(4);
 expect(container.querySelectorAll('div.h-1')).toHaveLength(4);
 expect(screen.getByRole('link', {name: 'View booking details'})).toHaveClass('w-full', 'sm:w-auto', 'min-h-11');
 expect(screen.getByText('Your event updates at a glance.')).toBeInTheDocument();
 expect(screen.getByText('The rate applies to eligible payments. Your actual refund is calculated when you request cancellation.')).toBeInTheDocument();
});
it('allows long metadata and unavailable policy text to wrap without truncation', () => {
 render(<EventJourneyBanner journey={{...journey, title: 'A very long family celebration and anniversary gathering', rate: null, policyStage: 'Refund policies vary by provider'}} />);
 expect(screen.getByRole('heading', {level: 2})).toHaveClass('break-words');
 expect(screen.getByText('Refund policies vary by provider')).toBeInTheDocument();
 expect(screen.getByRole('link', {name: 'View policies'})).toHaveClass('min-h-11');
 expect(screen.getAllByText('Confirmed').some(element => element.classList.contains('max-w-[40%]'))).toBe(true);
});

it.each(['Your upcoming event', 'Event in progress'] as const)('renders scheduled banner heading %s', bannerTitle => {
 render(<EventJourneyBanner journey={{...journey, bannerTitle}} />);
 expect(screen.getByText(bannerTitle)).toBeInTheDocument();
});
