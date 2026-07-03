export type AppErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "XHS_FETCH_FAILED"
  | "XHS_MANUAL_REQUIRED"
  | "AI_NOT_CONFIGURED"
  | "AI_GENERATION_FAILED"
  | "DATABASE_ERROR"
  | "RATE_LIMITED"
  | "UNKNOWN_ERROR";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public statusCode = 500,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toErrorResponse(error: unknown): {
  status: number;
  body: { error: { code: AppErrorCode; message: string; details?: unknown } };
} {
  if (isAppError(error)) {
    return {
      status: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
    };
  }

  const message =
    error instanceof Error ? error.message : "Internal server error";

  return {
    status: 500,
    body: { error: { code: "UNKNOWN_ERROR", message } },
  };
}
