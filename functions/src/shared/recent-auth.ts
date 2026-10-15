import {HttpsError} from "firebase-functions/v2/https";

const recentAuthenticationSeconds = 5 * 60;

export function requireRecentAuthentication(
  authTime: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): void {
  if (typeof authTime !== "number") {
    throw new HttpsError(
      "unauthenticated",
      "Recent authentication is required.",
    );
  }
  const age = nowSeconds - authTime;
  if (age < 0 || age > recentAuthenticationSeconds) {
    throw new HttpsError(
      "unauthenticated",
      "Recent authentication is required.",
    );
  }
}
