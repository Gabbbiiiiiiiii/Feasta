import {db} from "../shared/firestore.js";
import {classifyBalanceDeadlineAttempt} from "./remaining-balance-enforcement-domain.js";
import {paymentIdForProviderRequestChoice} from "./payment-obligation.js";

export async function readBalanceDeadlineAttempt(input: {
  transaction: FirebaseFirestore.Transaction; providerRequestId: string;
  providerRequest: Readonly<Record<string, unknown>>; mainEvent: Readonly<Record<string, unknown>>;
}) {
  const reference = db.collection("payments").doc(
    paymentIdForProviderRequestChoice(input.providerRequestId, "remaining_balance"));
  const [payment, attempts, successes] = await Promise.all([
    input.transaction.get(reference), input.transaction.get(reference.collection("checkoutAttempts")),
    input.transaction.get(reference.collection("gatewayPayments")),
  ]);
  return classifyBalanceDeadlineAttempt({...input, payment: payment.data() ?? null,
    attempts: attempts.docs.map((doc) => ({id: doc.id, data: doc.data()})), gatewaySuccessCount: successes.size});
}
