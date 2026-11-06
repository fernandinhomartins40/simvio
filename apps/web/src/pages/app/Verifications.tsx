import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { EmptyState, LoadError, Loading, PageHeader, StatusBadge, verificationStatus, type Tone } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SelectField } from "@/components/ui/form";
import { useOrg } from "@/layouts/AppShell";
import { useAction } from "@/lib/action";
import { dateTime, failureLabel } from "@/lib/format";
import { panel, useResource } from "@/lib/session";
import type { Application, VerificationRow } from "@/lib/types";

type Page = { items: VerificationRow[]; next_cursor: string | null };

const webhookStatus: Record<string, { tone: Tone; label: string }> = {
  succeeded: { tone: "ok", label: "Aviso entregue" },
  pending: { tone: "wait", label: "Aviso em envio" },
  failed: { tone: "error", label: "Aviso não entregue" },
};

export default function VerificationsPage() {
  const { base, env } = useOrg();
  const [status, setStatus] = useState("");
  const [appId, setAppId] = useState("");
  const apps = useResource<Application[]>(`${base}/applications`);

  const query = new URLSearchParams({ environment: env });
  if (status) query.set("status", status);
  if (appId) query.set("application_id", appId);
  const path = `${base}/verifications?${query}`;

  const first = useResource<Page>(path, { interval: 15_000 });
  const [more, setMore] = useState<VerificationRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  // Ao trocar filtro, recomeça da primeira página.
  useEffect(() => {
    setMore([]);
    setCursor(null);
  }, [path]);
  const next = more.length ? cursor : (first.data?.next_cursor ?? null);

  const loadMore = useAction(async () => {
    const p = await panel<Page>(`${path}&cursor=${encodeURIComponent(next!)}`);
    setMore((m) => [...m, ...p.items]);
    setCursor(p.next_cursor);
  });

  const rows = [...(first.data?.items ?? []), ...more.filter((r) => !first.data?.items.some((f) => f.id === r.id))];

  return (
    <>
      <PageHeader title="Verificações" description={`Histórico do ambiente de ${env === "live" ? "Produção" : "Teste"}. Os números aparecem mascarados.`} />
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todas</option>
          {Object.entries(verificationStatus).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </SelectField>
        <SelectField label="Aplicação" value={appId} onChange={(e) => setAppId(e.target.value)}>
          <option value="">Todas</option>
          {apps.data?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </SelectField>
      </div>

      {first.loading && !first.data && <Loading />}
      {first.error && !first.data && <LoadError error={first.error} onRetry={first.reload} />}
      {first.data && rows.length === 0 && (
        <EmptyState icon={ListChecks} title="Nenhuma verificação" text="Quando sua aplicação criar verificações, elas aparecem aqui." />
      )}

      {rows.length > 0 && (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-linha">
            {rows.map((v) => {
              const s = verificationStatus[v.status] ?? verificationStatus.failed!;
              const w = v.webhook ? webhookStatus[v.webhook] : null;
              return (
                <li key={v.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-semibold">{v.phone} <span className="font-normal text-petroleo-soft">· {v.application}</span></p>
                    <p className="truncate text-sm text-petroleo-soft">
                      Referência {v.reference} · criada {dateTime(v.created_at)}
                      {v.verified_at && ` · confirmada ${dateTime(v.verified_at)}`}
                      {v.failure_reason && ` · ${failureLabel[v.failure_reason] ?? v.failure_reason}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                    {w && <StatusBadge tone={w.tone}>{w.label}</StatusBadge>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {next && (
        <Button variant="outline" className="self-start" disabled={loadMore.busy} onClick={() => loadMore.run()}>
          {loadMore.busy ? "Carregando…" : "Carregar mais"}
        </Button>
      )}
      {loadMore.error && <p role="alert" className="text-erro">{loadMore.error}</p>}
    </>
  );
}
