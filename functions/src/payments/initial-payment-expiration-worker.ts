import {onSchedule} from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import {sweepInitialPaymentExpiration} from "./initial-payment-expiration.js";

/** Isolated from all completion, balance, gateway, refund and disbursement work. */
export const reconcileInitialPaymentExpiration = onSchedule({
  schedule: "every 1 minutes", timeZone: "Asia/Manila", region: "asia-southeast1",
  memory: "256MiB", maxInstances: 1, concurrency: 1, timeoutSeconds: 120, retryCount: 0,
}, async () => {
  const started = performance.now();
  let page = {scanned: 0, completed: 0};
  // Admission checks do not cancel an RPC. The platform timeout applies only to
  // this isolated worker. Each page has five candidates, two transaction attempts
  // each, and at most 51 membership documents per candidate (overflow fails closed).
  await sweepInitialPaymentExpiration(new Date(), {
    remaining: () => performance.now() - started < 59_000,
    checkpoint: () => performance.now() - started < 60_000,
    pageLimit: 5, maxEventRequests: 50, onPage: result => {page = result;},
  });
  logger.info("Initial expiration worker completed.", {...page, durationMs: performance.now() - started});
});
