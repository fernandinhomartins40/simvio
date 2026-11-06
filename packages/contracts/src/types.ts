export const VERIFICATION_STATUSES = ["pending", "verified", "expired", "cancelled", "failed"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const ENVIRONMENTS = ["test", "live"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const ROLES = ["owner", "developer", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PURPOSES = ["signup", "verification"] as const;
export type Purpose = (typeof PURPOSES)[number];

export const WEBHOOK_EVENT_TYPES = [
  "verification.verified",
  "verification.expired",
  "verification.cancelled",
  "verification.failed",
] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/** Códigos de erro estáveis da API (campo `error.code`). */
export const ERROR_CODES = [
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "receiver_unavailable",
  "expired",
  "rate_limited",
  "plan_limit",
  "suspended",
  "internal_error",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];
