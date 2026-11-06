/** Cliente da API na mesma origem (/api/v1). Nunca guarda segredos no navegador. */
export const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: "same-origin",
      ...init,
      headers: { accept: "application/json", ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError(0, "network", "Sem conexão. Verifique sua internet e tente de novo.");
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string; details?: Record<string, unknown> } }).error;
    throw new ApiError(res.status, e?.code ?? "error", e?.message ?? "Algo deu errado. Tente de novo.", e?.details);
  }
  return json as T;
}
