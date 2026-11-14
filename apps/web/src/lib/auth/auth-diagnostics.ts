import type {SignInMethod} from "./sign-in-error";

export function authDiagnostic(
  method: SignInMethod,
  stage: "persistence" | "popup" | "credential" | "profile" | "session_exchange" | "ui_refresh" | "rollback",
  outcome: "started" | "succeeded" | "failed",
  error?: unknown,
  credentialObtained = false,
  currentUserPresent = false,
) {
  if (process.env.NODE_ENV !== "development") return;
  const value = error && typeof error === "object" ? error as {code?: unknown; reason?: unknown; name?: unknown} : {};
  // Only bounded machine identifiers; never serialize an error, credential or user.
  const code = typeof value.code === "string" && /^(auth|functions)\/[a-z-]{1,64}$/.test(value.code)
    ? value.code : value.reason === "google_timeout" || value.name === "TimeoutError"
      ? "timeout" : value.name === "AbortError" ? "aborted" : "unknown";
  console.info("[FEASTA auth]", {method, stage, outcome, ...(outcome === "failed" ? {code} : {}), credentialObtained, currentUserPresent});
}
