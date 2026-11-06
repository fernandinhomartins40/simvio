export const dateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export function relative(iso: string | null | undefined) {
  if (!iso) return "nunca";
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (minutes < 1) return "agora há pouco";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return `há ${Math.round(hours / 24)} dia(s)`;
}

export const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const roleLabel = { owner: "Proprietário", developer: "Desenvolvimento", viewer: "Visualização" } as const;

export const failureLabel: Record<string, string> = {
  receiver_revoked: "Aparelho receptor revogado",
  receiver_line_changed: "Número do receptor foi trocado",
  superseded: "Substituída por nova verificação",
  cancelled_by_integrator: "Cancelada pela aplicação",
};
