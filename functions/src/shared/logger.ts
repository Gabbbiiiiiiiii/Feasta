import {logger} from "firebase-functions";

export function logInfo(
  message: string,
  context: Record<string, unknown> = {},
): void {
  logger.info(message, sanitizeForLog(context));
}

export function logWarning(
  message: string,
  context: Record<string, unknown> = {},
): void {
  logger.warn(message, sanitizeForLog(context));
}

export function logError(
  message: string,
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  logger.error(message, sanitizeForLog({
    ...context,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : error,
  }));
}

const SENSITIVE_KEY = new RegExp(
  "(?:authorization|cookie|password|secret|token|" +
  "api[-_]?key|private[-_]?key|signature)",
  "iu",
);
const SENSITIVE_VALUE = new RegExp(
  "(?:sk_(?:live|test)_[A-Za-z0-9_-]+|whsec_[A-Za-z0-9_-]+|" +
  "AIza[0-9A-Za-z_-]{20,}|-----BEGIN[^-]*PRIVATE KEY-----|Bearer\\s+\\S+)",
  "gu",
);

/** Removes credential-shaped data before structured context reaches logs. */
export function sanitizeForLog(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") {
    return value.replace(SENSITIVE_VALUE, "[REDACTED]");
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeForLog(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SENSITIVE_KEY.test(key) ?
        "[REDACTED]" : sanitizeForLog(item, depth + 1);
    }
    return output;
  }
  return value;
}
