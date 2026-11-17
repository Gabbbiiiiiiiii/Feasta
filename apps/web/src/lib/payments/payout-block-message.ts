/** Presentation only. Never authorizes a retry or changes financial readiness. */
export function payoutBlockMessage(reason?: string | null): string {
  const messages: Record<string, string> = {
    platform_disbursements_disabled: "Application payout transfers are disabled. Eligible earnings have not been confirmed as transferred.",
    relationship_unknown: "The PayMongo provider account link is not verified. Complete account linking before enabling transfers.",
    relationship_disabled: "The PayMongo provider account link is disabled. Review it with PayMongo before enabling transfers.",
    account_not_ready: "The provider payout account has not completed the required account checks.",
    transport_disabled: "Payout transfer setup is not configured. Eligible earnings remain unpaid.",
    transport_unverified: "Payout transfer setup needs verification before money can be sent.",
    paymongo_test_disbursement_not_allowed: "This payout is outside the permitted test transfer. It has not been selected for dispatch.",
  };
  return messages[reason?.replace(/^provider_/, "") ?? ""] ?? "Transfer setup or destination verification is incomplete. Eligible earnings are not a confirmed payout.";
}
