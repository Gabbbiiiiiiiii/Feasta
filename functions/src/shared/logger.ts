import {logger} from "firebase-functions";

export function logInfo(
  message: string,
  context: Record<string, unknown> = {},
): void {
  logger.info(message, context);
}

export function logWarning(
  message: string,
  context: Record<string, unknown> = {},
): void {
  logger.warn(message, context);
}

export function logError(
  message: string,
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  logger.error(message, {
    ...context,
    error:
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
          }
        : error,
  });
}