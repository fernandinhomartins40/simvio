import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "./api";

export type Role = "owner" | "developer" | "viewer";

export interface Me {
  user: { id: string; name: string; email: string; is_super_admin: boolean };
  csrf_token: string;
  organizations: { id: string; name: string; role: Role }[];
}

// O token CSRF fica só em memória; a sessão é um cookie HttpOnly.
let csrfToken = "";

/** Chamada autenticada do painel: inclui o token CSRF nas operações que alteram dados. */
export function panel<T>(path: string, init: RequestInit = {}) {
  const method = init.method ?? "GET";
  return api<T>(path, {
    ...init,
    method,
    headers: { ...(method === "GET" ? {} : { "x-csrf-token": csrfToken }), ...init.headers },
  });
}

export const post = <T,>(path: string, body?: unknown) =>
  panel<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
export const patch = <T,>(path: string, body: unknown) => panel<T>(path, { method: "PATCH", body: JSON.stringify(body) });
export const del = <T,>(path: string) => panel<T>(path, { method: "DELETE" });

interface SessionValue {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  logout: () => Promise<void>;
}

const SessionCtx = createContext<SessionValue>(null!);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const m = await api<Me>("/auth/me");
      csrfToken = m.csrf_token;
      setMe(m);
      return m;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await post("/auth/logout").catch(() => undefined);
    csrfToken = "";
    setMe(null);
  }, []);

  const value = useMemo(() => ({ me, loading, refresh, logout }), [me, loading, refresh, logout]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export const useSession = () => useContext(SessionCtx);

/** Carrega um recurso; `interval` atualiza em segundo plano sem apagar a tela nem formulários. */
export function useResource<T>(path: string | null, opts: { interval?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!path);
  const current = useRef(path);
  current.current = path;

  const reload = useCallback(async () => {
    if (!path) return;
    try {
      const d = await panel<T>(path);
      if (current.current === path) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (current.current === path) setError(e as ApiError);
    } finally {
      if (current.current === path) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    setLoading(!!path);
    reload();
    if (!opts.interval) return;
    const t = setInterval(() => !document.hidden && reload(), opts.interval);
    return () => clearInterval(t);
  }, [reload, path, opts.interval]);

  return { data, error, loading, reload };
}
