export type ErrorReason =
  | "offline"
  | "asleep_timeout"
  | "auth_error"
  | "command_rejected"
  | "rate_limited"
  | "not_found"
  | "bad_request"
  | "tesla_error"
  | "unknown";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public reason: ErrorReason,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
  }
}
