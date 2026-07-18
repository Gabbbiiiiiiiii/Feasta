import {FUNCTION_REGION} from "./constants.js";

/**
 * App Check is enforced for deployed callable functions. The Functions
 * emulator does not validate real attestation tokens, so enforcement is
 * deliberately disabled only when Firebase sets FUNCTIONS_EMULATOR=true.
 */
export function shouldEnforceAppCheck(
  environment: {FUNCTIONS_EMULATOR?: string} = process.env,
): boolean {
  return environment.FUNCTIONS_EMULATOR !== "true";
}

export const appCheckCallableOptions = {
  region: FUNCTION_REGION,
  enforceAppCheck: shouldEnforceAppCheck(),
} as const;
