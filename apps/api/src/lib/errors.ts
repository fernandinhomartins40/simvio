import type { ErrorCode } from "@simvio/contracts";

const STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  expired: 410,
  plan_limit: 402,
  suspended: 403,
  rate_limited: 429,
  receiver_unavailable: 503,
  internal_error: 500,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export const notFound = (what = "Recurso") => new ApiError("not_found", `${what} não encontrado.`);
export const forbidden = (msg = "Você não tem permissão para esta ação.") => new ApiError("forbidden", msg);
export const unauthorized = (msg = "Credencial ausente ou inválida.") => new ApiError("unauthorized", msg);
export const invalid = (msg: string, details?: Record<string, unknown>) =>
  new ApiError("invalid_request", msg, details);
