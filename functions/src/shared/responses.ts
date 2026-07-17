interface Response {
  status(code: number): Response;
  json(body: unknown): void;
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function sendSuccess<T>(
  response: Response,
  data: T,
  statusCode = 200,
): void {
  const body: SuccessResponse<T> = {
    success: true,
    data,
  };

  response.status(statusCode).json(body);
}

export function sendError(
  response: Response,
  options: {
    code: string;
    message: string;
    statusCode?: number;
    details?: unknown;
  },
): void {
  const body: ErrorResponse = {
    success: false,
    error: {
      code: options.code,
      message: options.message,
      ...(options.details !== undefined
        ? {details: options.details}
        : {}),
    },
  };

  response
    .status(options.statusCode ?? 500)
    .json(body);
}
