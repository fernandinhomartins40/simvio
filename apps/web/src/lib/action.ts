import { useCallback, useState } from "react";
import type { ApiError } from "./api";

/** Executa uma ação do formulário guardando "enviando" e a mensagem de erro, sem apagar o que foi digitado. */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setBusy(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError((e as ApiError).message ?? "Algo deu errado. Tente de novo.");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [fn],
  );

  return { run, busy, error, setError };
}

/** Lê o token do fragmento (#token=...) e o remove da barra de endereço; o fragmento não vai para o servidor nem para logs. */
let lastToken: string | null = null;
export function takeHashToken() {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
  if (token) {
    lastToken = token;
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  // Em desenvolvimento o React chama o inicializador duas vezes; o segundo recebe o mesmo token.
  return token ?? lastToken;
}
