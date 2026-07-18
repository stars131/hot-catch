export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "DEPENDENCY_UNAVAILABLE"
  | "CREDENTIAL_NOT_CONFIGURED"
  | "CREDENTIAL_INVALID"
  | "JOB_FAILED"
  | "PROVIDER_ERROR"
  | "XHS_FETCH_FAILED"
  | "XHS_MANUAL_REQUIRED"
  | "AI_NOT_CONFIGURED"
  | "AI_GENERATION_FAILED"
  | "SCORING_NOT_SUPPORTED"
  | "PUBLISHING_NOT_SUPPORTED"
  | "FEATURE_DISABLED"
  | "DATABASE_ERROR"
  | "RATE_LIMITED"
  | "UNKNOWN_ERROR";

const ERROR_MESSAGE_KEYS: Record<AppErrorCode, string> = {
  UNAUTHORIZED: "errors.unauthorized",
  FORBIDDEN: "errors.forbidden",
  VALIDATION_ERROR: "errors.validation",
  NOT_FOUND: "errors.notFound",
  CONFLICT: "errors.conflict",
  DEPENDENCY_UNAVAILABLE: "errors.dependencyUnavailable",
  CREDENTIAL_NOT_CONFIGURED: "errors.credentialRequired",
  CREDENTIAL_INVALID: "errors.credentialInvalid",
  JOB_FAILED: "errors.jobFailed",
  PROVIDER_ERROR: "errors.provider",
  XHS_FETCH_FAILED: "errors.provider",
  XHS_MANUAL_REQUIRED: "errors.referenceBlocked",
  AI_NOT_CONFIGURED: "errors.credentialRequired",
  AI_GENERATION_FAILED: "errors.generationFailed",
  SCORING_NOT_SUPPORTED: "errors.scoringNotSupported",
  PUBLISHING_NOT_SUPPORTED: "errors.publishingNotSupported",
  FEATURE_DISABLED: "errors.featureDisabled",
  DATABASE_ERROR: "errors.dependencyUnavailable",
  RATE_LIMITED: "errors.rateLimited",
  UNKNOWN_ERROR: "errors.generic",
};

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
  body: {
    error: {
      code: AppErrorCode;
      message: string;
      messageKey: string;
      details?: unknown;
    };
  };
} {
  if (isAppError(error)) {
    return {
      status: error.statusCode,
      body: {
        error: {
          code: error.code,
          message: error.message,
          messageKey: detailMessageKey(error.details) ?? ERROR_MESSAGE_KEYS[error.code],
          details: error.details,
        },
      },
    };
  }

  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : error instanceof Error
        ? error.message
        : "Internal server error";

  return {
    status: 500,
    body: {
      error: {
        code: "UNKNOWN_ERROR",
        message,
        messageKey: ERROR_MESSAGE_KEYS.UNKNOWN_ERROR,
      },
    },
  };
}

function detailMessageKey(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const value = (details as Record<string, unknown>).messageKey;
  return typeof value === "string" ? value : null;
}
