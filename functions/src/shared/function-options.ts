import {FUNCTION_REGION} from "./constants.js";

/**
 * App Check is enforced for deployed callable functions. The Functions
 * emulator does not validate real attestation tokens, so enforcement is
 * disabled only when Firebase sets FUNCTIONS_EMULATOR=true.
 *
 * Callable endpoints must be reachable at the HTTP transport layer so the
 * Firebase Functions SDK can deliver Auth and App Check tokens. Authorization
 * remains enforced inside each callable.
 */
export function shouldEnforceAppCheck(
  environment: {
    FUNCTIONS_EMULATOR?: string;
  } = process.env,
): boolean {
  return environment.FUNCTIONS_EMULATOR !==
    "true";
}

export const appCheckCallableOptions = {
  region: FUNCTION_REGION,
  enforceAppCheck:
    shouldEnforceAppCheck(),
  invoker: "public",
} as const;