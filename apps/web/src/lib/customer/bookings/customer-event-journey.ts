import {bookingPolicyV3Presentation} from '@/lib/payments/booking-policy-v3-presentation';
import {hasBookingSettlement, projectBookingPayment} from '@/lib/payments/booking-payment-projection';
export function isJourneyConfirmed(data: Record<string, unknown>): boolean {
  if (!['confirmed', 'in_progress'].includes(String(data.status))) return false;
  if (['refunded', 'partially_refunded'].includes(String(data.paymentStatus))) return false;
  if (hasBookingSettlement(data)) return ['paid', 'partially_paid'].includes(String(projectBookingPayment(data)));
  return ['paid', 'fully_paid', 'down_payment_paid', 'partially_paid'].includes(String(data.paymentStatus)) && data.confirmedAt != null;
}
export type EventJourney = {bannerTitle?: 'Your upcoming event' | 'Event in progress'; id: string; title: string; when: string; location: string; providers: string; status: string; stage: number; policyStage: string; rate: string | null; others: boolean};
const stages = ['preparation_not_started', 'preparation_started', 'service_started'];
export const stageLabels = ['Preparation not started', 'Preparation started', 'Service started'];
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' ? v as Record<string, unknown> : {};
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
/** Read-only display projection. Never used to approve cancellation or execute a refund. */
export function journeyPolicy(data: Record<string, unknown>, now: Date): {stage: number; rate: string | null} {
  const policy = bookingPolicyV3Presentation(data, now);
  const snapshot = record(data.refundPolicySnapshot), agreement = record(data.refundPolicyAgreement), state = record(data.refundEligibilityState), source = record(snapshot.source);
  const date = (v: unknown) => {try {const d = (v as {toDate: () => Date})?.toDate(); return d instanceof Date && d <= now;} catch {return false;}};
  const blocked = data.activeCancellationRequestId != null || data.approvedCancellationRequestId != null || state.activeCancellationRequestId != null || data.refundExecutionLock != null || data.reconciliationRequired === true || data.lifecycleReconciliationRequired === true || (data.remainingBalanceEnforcementSchemaVersion != null && (data.remainingBalanceEnforcementSchemaVersion !== 1 || data.remainingBalanceEnforcement == null)) || (data.remainingBalanceEnforcement != null && record(data.remainingBalanceEnforcement).status !== 'clear');
  let stage = stages.indexOf(String(state.currentStage));
  if (data.remainingBalanceTimingSchemaVersion === 3) {
    if (blocked || !policy || ['hold', 'review', 'cancelled', 'completed'].includes(policy.state)) return {stage: 1, rate: null};
    stage = ['in_progress', 'awaiting_completion'].includes(policy.state) ? 2 : policy.state === 'preparation' ? 1 : 0;
  }
  const journeyStage = blocked ? 1 : data.remainingBalanceTimingSchemaVersion === 3 ? stage + 1 : data.status === 'in_progress' ? 3 : 1;
  if (blocked || !['confirmed', 'in_progress'].includes(String(data.status)) || snapshot.schemaVersion !== 1 || agreement.schemaVersion !== 1 || state.schemaVersion !== 1 || stage < 0 ||
    !exact(snapshot, ['schemaVersion', 'policyKey', 'source', 'rules', 'terms', 'capturedAt']) || !exact(source, ['kind', 'sourceId', 'policyVersion']) ||
    !exact(agreement, ['schemaVersion', 'policyKey', 'agreedAt', 'channel']) || !exact(state, ['schemaVersion', 'currentStage', 'stageSequence', 'enteredAt', 'activeCancellationRequestId']) ||
    (snapshot.terms !== null && (typeof snapshot.terms !== 'string' || snapshot.terms.length > 4000)) || state.activeCancellationRequestId !== null ||
    !['provider_default', 'package_override'].includes(String(source.kind)) || typeof source.sourceId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(source.sourceId) || !Number.isSafeInteger(source.policyVersion) || Number(source.policyVersion) < 1 ||
    snapshot.policyKey !== `${source.kind}:${source.sourceId}:v${source.policyVersion}` || agreement.policyKey !== snapshot.policyKey || agreement.channel !== 'booking_submission' ||
    !date(snapshot.capturedAt) || !date(agreement.agreedAt) || !date(state.enteredAt) || !Number.isSafeInteger(state.stageSequence) ||
    !(state.currentStage === stages[0] ? state.stageSequence === 0 : state.currentStage === stages[1] ? state.stageSequence === 1 : state.currentStage === stages[2] && [1, 2].includes(Number(state.stageSequence)))) return {stage: journeyStage, rate: null};
  const rules = snapshot.rules;
  if (!Array.isArray(rules) || rules.length !== 3 || !stages.every(s => rules.filter(r => record(r).stage === s).length === 1) || rules.some(r => !exact(record(r), ['stage', 'refundBasisPoints']) || !Number.isSafeInteger(record(r).refundBasisPoints) || Number(record(r).refundBasisPoints) < 0 || Number(record(r).refundBasisPoints) > 10000)) return {stage: journeyStage, rate: null};
  const bps = record(rules.find(r => record(r).stage === stages[stage])).refundBasisPoints as number;
  return {stage: stage + 1, rate: `${new Intl.NumberFormat('en-PH', {maximumFractionDigits: 2}).format(bps / 100)}%`};
}
export function eventStart(data: Record<string, unknown>): number {
  try {
    const start = (data.eventStartAt as {toDate?: () => Date})?.toDate?.();
    if (start) return start.getTime();
    const date = (data.eventDate as {toDate?: () => Date})?.toDate?.();
    if (!date || typeof data.eventTime !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/u.test(data.eventTime)) return NaN;
    const day = new Intl.DateTimeFormat('en-CA', {timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'}).format(date);
    return new Date(`${day}T${data.eventTime}:00+08:00`).getTime();
  } catch {return NaN;}
}
