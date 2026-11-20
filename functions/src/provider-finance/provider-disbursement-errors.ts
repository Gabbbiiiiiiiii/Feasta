/** Only the transport boundary can prove that no write was attempted.
 * Never infer this certainty from HTTP status, error text, or an empty lookup. */
export class DisbursementSubmissionError extends Error {
  constructor(
    readonly certainty: "not_submitted" | "unknown",
    readonly reasonCode: "secret_invalid" | "authority_invalid" | "wallet_verification_failed" |
      "wallet_balance_invalid" | "wallet_balance_insufficient" | "submission_unconfirmed",
  ) {
    super(reasonCode === "secret_invalid" ? "PayMongo test secret required." :
      `PayMongo test disbursement ${certainty}: ${reasonCode}.`);
    this.name = "DisbursementSubmissionError";
  }
}
