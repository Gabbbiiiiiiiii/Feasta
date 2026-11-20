import {db} from "../shared/firestore.js";
import {
  REFUND_POLICY_ROLLOUT_DOCUMENT_ID,
  parseBookingRefundPolicyRollout,
  resolveBookingRefundPolicies,
  type BookingRefundPolicyRelationship,
} from "./booking-refund-policy.js";

export async function loadSpecialOfferRefundPolicies(
  tx: FirebaseFirestore.Transaction,
  relationship: BookingRefundPolicyRelationship,
) {
  const rollout = await tx.get(db.collection("appSettings").doc(REFUND_POLICY_ROLLOUT_DOCUMENT_ID));
  const mode = parseBookingRefundPolicyRollout({exists: rollout.exists, data: rollout.data()});
  return mode === "required" ? resolveBookingRefundPolicies([relationship]) : new Map();
}
