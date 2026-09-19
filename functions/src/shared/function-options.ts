import {FUNCTION_REGION} from "./constants.js";

export function shouldEnforceAppCheck(
  environment: {
    FUNCTIONS_EMULATOR?: string;
  } = process.env,
): boolean {
  return environment.FUNCTIONS_EMULATOR !==
    "true";
}

function allowedWebOrigins(
  environment: {
    WEB_ALLOWED_ORIGINS?: string;
  } = process.env,
): string[] {
  return (
    environment.WEB_ALLOWED_ORIGINS
      ?.split(",")
      .map(
        (origin) =>
          origin.trim(),
      )
      .filter(Boolean) ??
    [
      "http://localhost:3000",
      "https://feasta-web.vercel.app",
    ]
  );
}

export const appCheckCallableOptions = {
  region: FUNCTION_REGION,

  enforceAppCheck:
    shouldEnforceAppCheck(),

  invoker: "public",

  cors:
    allowedWebOrigins(),
} as const;