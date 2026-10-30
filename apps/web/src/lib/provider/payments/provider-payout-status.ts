import type {ProviderPayoutAccountView} from "./provider-finance-types";

export const PAYOUT_SETUP_UNAVAILABLE_GUIDANCE =
  "PayMongo could not start payout setup. Please try again. " +
  "If the problem continues, the payout integration configuration " +
  "needs to be checked.";

export const PAYOUT_SETUP_HTTP_404_DETAIL =
  "PayMongo setup request returned HTTP 404.";

export const PAYOUT_GATEWAY_AUTHENTICATION_FAILED_GUIDANCE =
  "PayMongo authentication failed. Verify the configured server secret key.";

export const PAYOUT_GATEWAY_FORBIDDEN_GUIDANCE =
  "The PayMongo parent account is not permitted to create this child account.";

export function payoutSetupGuidance(
  account: Pick<
    ProviderPayoutAccountView,
    "payoutReady" | "childAccountPresent" | "gatewayLastStatusCode"
  >,
): string | null {
  if (
    account.payoutReady ||
    account.childAccountPresent
  ) {
    return null;
  }

  if (account.gatewayLastStatusCode === 401) {
    return PAYOUT_GATEWAY_AUTHENTICATION_FAILED_GUIDANCE;
  }

  if (account.gatewayLastStatusCode === 403) {
    return PAYOUT_GATEWAY_FORBIDDEN_GUIDANCE;
  }

  if (account.gatewayLastStatusCode === 404) {
    if (process.env.NODE_ENV === "development") {
      return `${PAYOUT_SETUP_UNAVAILABLE_GUIDANCE} ${PAYOUT_SETUP_HTTP_404_DETAIL}`;
    }

    return PAYOUT_SETUP_UNAVAILABLE_GUIDANCE;
  }

  return null;
}
