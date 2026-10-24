import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest';
import {Timestamp} from 'firebase-admin/firestore';
import {journeyPolicy, eventStart, isJourneyConfirmed} from '@/lib/customer/bookings/customer-event-journey';
const ts = (s: string) => Timestamp.fromDate(new Date(s));
const now = new Date('2026-10-24T00:59:59Z');
function request(): Record<string, unknown> {return {status: 'confirmed', paymentStatus: 'paid', confirmedAt: ts('2026-10-20'), remainingBalanceTimingSchemaVersion: 3, balanceDueHoursBeforeEvent: 48,
 eventStartAt: ts('2026-10-25T01:00:00Z'), remainingBalanceDueAt: ts('2026-10-23T01:00:00Z'), hardPaymentDeadlineAt: ts('2026-10-24T01:00:00Z'), preparationStartsAt: ts('2026-10-24T01:00:00Z'),
 bookingLifecyclePolicySnapshot: {schemaVersion: 3, providerStartsManually: false, requiresFullPayment: true, autoStartAtScheduledTime: true, providerConfirmsCompletion: true},
 settlementSchemaVersion: 1, financialSnapshot: {grossAmountInCentavos: 1000}, grossSettledAmountInCentavos: 1000, settlementStatus: 'fully_settled', outstandingAmountInCentavos: 0,
 refundPolicySnapshot: {schemaVersion: 1, policyKey: 'provider_default:p:v1', source: {kind: 'provider_default', sourceId: 'p', policyVersion: 1}, capturedAt: ts('2026-10-20'), terms: null,
 rules: [{stage: 'preparation_not_started', refundBasisPoints: 10000}, {stage: 'preparation_started', refundBasisPoints: 5000}, {stage: 'service_started', refundBasisPoints: 0}]},
 refundPolicyAgreement: {schemaVersion: 1, policyKey: 'provider_default:p:v1', agreedAt: ts('2026-10-20'), channel: 'booking_submission'},
 refundEligibilityState: {schemaVersion: 1, currentStage: 'preparation_not_started', stageSequence: 0, enteredAt: ts('2026-10-20'), activeCancellationRequestId: null}};}
describe('journey projection', () => {
 it.each([['2026-10-24T00:59:59Z', 1, '100%'], ['2026-10-24T01:00:00Z', 2, '50%'], ['2026-10-25T01:00:00Z', 3, '0%']])('uses exact Manila boundary %s', (at, stage, rate) => expect(journeyPolicy(request(), new Date(at))).toEqual({stage, rate}));
 it('formats non-default provider basis points', () => {const r = request(); (r.refundPolicySnapshot as {rules: {refundBasisPoints: number}[]}).rules[0].refundBasisPoints = 8765; expect(journeyPolicy(r, now).rate).toBe('87.65%');});
 it.each([{activeCancellationRequestId: 'cancel'}, {refundExecutionLock: {}}, {reconciliationRequired: true}, {lifecycleReconciliationRequired: true}, {remainingBalanceEnforcement: {status: 'on_hold'}}, {outstandingAmountInCentavos: 100}])('blocks lifecycle advancement %j', change => expect(journeyPolicy({...request(), ...change}, new Date('2026-10-25T01:00:00Z')).stage).toBe(1));
 it.each([{refundPolicySnapshot: null}, {refundPolicyAgreement: null}, {refundEligibilityState: null}, {refundPolicyAgreement: {policyKey: 'wrong'}}, {refundPolicySnapshot: {rules: []}}])('hides unverifiable rates %j', change => expect(journeyPolicy({...request(), ...change}, now).rate).toBeNull());
 it('does not infer manual preparation from event date', () => expect(journeyPolicy({...request(), remainingBalanceTimingSchemaVersion: undefined}, new Date('2026-10-25T01:00:00Z')).rate).toBe('100%'));
 it('requires confirmed status and valid settlement', () => {expect(isJourneyConfirmed({...request(), status: 'accepted'})).toBe(false); expect(isJourneyConfirmed({...request(), grossSettledAmountInCentavos: 0})).toBe(false); expect(isJourneyConfirmed(request())).toBe(true);});
 it('interprets legacy date and time in Manila', () => expect(eventStart({eventDate: ts('2026-10-24T16:00:00Z'), eventTime: '09:00'})).toBe(Date.parse('2026-10-25T01:00:00Z')));
});
const f = vi.hoisted(() => ({events: [] as {id: string; data: () => Record<string, unknown>}[], requests: new Map<string, Record<string, unknown>>(), auth: vi.fn(), where: vi.fn()}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/session', () => ({requireCustomer: f.auth}));
vi.mock('@/lib/firebase/admin', () => ({adminDb: {collection: () => {const q = {where: (...args: unknown[]) => {f.where(...args); return q;}, get: async () => ({docs: f.events}), doc: (id: string) => ({id})}; return q;}, getAll: async (...refs: {id: string}[]) => refs.map(r => ({id: r.id, exists: f.requests.has(r.id), data: () => f.requests.get(r.id)}))}}));
import {getCustomerEventJourney} from '@/lib/customer/bookings/customer-event-journey-service';
beforeEach(() => {f.auth.mockReset().mockResolvedValue({uid: 'me'}); f.events = []; f.requests.clear(); f.where.mockClear();});
function add(id: string, at = '2099-10-25T01:00:00Z', changes = {}) {f.events.push({id, data: () => ({customerId: 'me', status: 'confirmed', eventType: 'birthday celebration', eventLocation: 'Ormoc City', eventStartAt: ts(at), eventDate: ts(at), eventTime: '09:00', eventEndTime: '11:00', providerRequestIds: [id], ...changes})}); f.requests.set(id, {...request(), providerRequestId: id, mainEventId: id, customerId: 'me', providerBusinessName: 'My caterer'});}
describe('authorized event selection', () => {
 it('selects nearest event and returns its canonical id and provider', async () => {add('later', '2099-10-28T01:00:00Z'); add('nearest'); expect(await getCustomerEventJourney()).toMatchObject({id: 'nearest', title: 'Birthday Celebration', providers: 'My caterer', location: 'Ormoc City', others: true}); expect(f.where).toHaveBeenCalledWith('customerId', '==', 'me');});
 it.each(['cancelled', 'expired', 'completed', 'rejected', 'waiting_for_down_payment', 'pending_provider_approval'])('excludes %s', async status => {add('event', undefined, {status}); expect(await getCustomerEventJourney()).toBeNull();});
 it('rejects foreign ownership', async () => {add('foreign', undefined, {customerId: 'other'}); expect(await getCustomerEventJourney()).toBeNull(); f.events = []; add('event'); f.requests.set('event', {...f.requests.get('event'), customerId: 'other'}); expect(await getCustomerEventJourney()).toBeNull();});
 it('requires authentication before any database read', async () => {f.auth.mockRejectedValue(new Error('Denied')); await expect(getCustomerEventJourney()).rejects.toThrow('Denied'); expect(f.where).not.toHaveBeenCalled();});
 it('does not combine provider rates', async () => {add('event', undefined, {providerRequestIds: ['event', 'second']}); f.requests.set('second', {...request(), providerRequestId: 'second', mainEventId: 'event', customerId: 'me'}); expect(await getCustomerEventJourney()).toMatchObject({rate: null, policyStage: 'Refund policies vary by provider'});});
});

afterEach(() => vi.useRealTimers());
describe('scheduled banner window', () => {
 it.each([
  ['2099-10-25T00:59:59Z', 'Your upcoming event'],
  ['2099-10-25T01:00:00Z', 'Event in progress'],
  ['2099-10-25T02:59:59Z', 'Event in progress'],
  ['2099-10-25T03:00:00Z', null],
  ['2099-10-26T03:00:00Z', null],
 ])('selects at %s', async (at, title) => {
   vi.useFakeTimers(); vi.setSystemTime(new Date(at));
   add('event', undefined, {status: 'in_progress'});
   f.requests.set('event', {...f.requests.get('event'), status: 'in_progress'});
   const result = await getCustomerEventJourney();
   if (title) expect(result?.bannerTitle).toBe(title); else expect(result).toBeNull();
   expect(f.requests.get('event')?.status).toBe('in_progress');
 });
 it('ended event does not hide the next future booking', async () => {
   vi.useFakeTimers(); vi.setSystemTime(new Date('2099-10-25T03:00:00Z'));
   add('ended', undefined, {status: 'in_progress'}); add('future', '2099-10-28T01:00:00Z');
   expect(await getCustomerEventJourney()).toMatchObject({id: 'future', bannerTitle: 'Your upcoming event'});
 });
 it('supports overnight events until the next Manila day end', async () => {
   vi.useFakeTimers(); vi.setSystemTime(new Date('2099-10-25T16:59:59Z'));
   add('night', '2099-10-25T14:00:00Z', {status: 'in_progress', eventTime: '22:00', eventEndTime: '01:00'});
   expect(await getCustomerEventJourney()).toMatchObject({id: 'night', bannerTitle: 'Event in progress'});
   vi.setSystemTime(new Date('2099-10-25T17:00:00Z'));
   expect(await getCustomerEventJourney()).toBeNull();
 });
 it.each([{eventEndTime: '25:00'}, {eventEndTime: null}, {eventTime: 'invalid'}, {eventStartAt: ts('2099-10-25T02:00:00Z')}])('rejects invalid schedule %j', async change => {
   add('event', undefined, change); expect(await getCustomerEventJourney()).toBeNull();
 });
 it.each(['completed', 'cancelled'])('excludes terminal provider requests %s', async status => {
   add('event'); f.requests.set('event', {...f.requests.get('event'), status}); expect(await getCustomerEventJourney()).toBeNull();
 });
});
