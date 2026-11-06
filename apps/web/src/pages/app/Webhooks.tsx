import { useState } from "react";
import { Bell, Plus, RotateCw, Send, Trash2 } from "lucide-react";
import { EmptyState, LoadError, Loading, PageHeader, SecretOnce, StatusBadge, type Tone } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormError, SelectField } from "@/components/ui/form";
import { useOrg } from "@/layouts/AppShell";
import { useAction } from "@/lib/action";
import { dateTime } from "@/lib/format";
import { del, patch, post, useResource } from "@/lib/session";
import type { Application, Delivery, Webhook } from "@/lib/types";

const deliveryStatus: Record<Delivery["status"], { tone: Tone; label: string }> = {
  succeeded: { tone: "ok", label: "Entregue" },
  pending: { tone: "wait", label: "Tentando" },
  failed: { tone: "error", label: "Não entregue" },
};

const eventLabel: Record<string, string> = {
  "verification.verified": "Número confirmado",
  "verification.expired": "Verificação expirada",
  "verification.cancelled": "Verificação cancelada",
  "verification.failed": "Verificação falhou",
};

export default function WebhooksPage() {
  const { base, canEdit, env } = useOrg();
  const apps = useResource<Application[]>(`${base}/applications`);
  const [filter, setFilter] = useState("");
  const deliveries = useResource<Delivery[]>(`${base}/deliveries?environment=${env}${filter ? `&status=${filter}` : ""}`, { interval: 15_000 });
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);

  const endpoints = (apps.data ?? []).flatMap((a) => a.webhooks.filter((w) => w.environment === env).map((w) => ({ ...w, app: a.name })));

  const toggle = useAction(async (w: Webhook) => {
    await patch(`${base}/webhooks/${w.id}`, { enabled: !w.enabled });
    apps.reload();
  });
  const rotate = useAction(async (w: Webhook) => {
    if (!confirm("Gerar novo segredo? Atualize seu servidor: avisos novos usarão o segredo novo.")) return;
    setSecret((await post<{ secret: string }>(`${base}/webhooks/${w.id}/rotate-secret`)).secret);
  });
  const remove = useAction(async (w: Webhook) => {
    if (!confirm("Excluir este endereço? Ele não receberá mais avisos.")) return;
    await del(`${base}/webhooks/${w.id}`);
    apps.reload();
  });
  const redeliver = useAction(async (id: string) => {
    await post(`${base}/deliveries/${id}/redeliver`);
    deliveries.reload();
  });

  return (
    <>
      <PageHeader
        title="Avisos automáticos"
        description="A Simvio avisa o seu servidor quando uma verificação muda de situação. Todo aviso é assinado."
        action={canEdit && (apps.data?.length ?? 0) > 0 && <Button onClick={() => setAdding(true)}><Plus aria-hidden /> Novo endereço</Button>}
      />

      {apps.loading && !apps.data && <Loading />}
      {apps.error && !apps.data && <LoadError error={apps.error} onRetry={apps.reload} />}
      {secret && <SecretOnce value={secret} name="o segredo de assinatura" />}
      <FormError message={toggle.error ?? rotate.error ?? remove.error} />

      {apps.data && endpoints.length === 0 && (
        <EmptyState
          icon={Bell}
          title={`Nenhum endereço em ${env === "live" ? "Produção" : "Teste"}`}
          text={apps.data.length ? "Cadastre a URL do seu servidor que vai receber os avisos." : "Crie uma aplicação primeiro."}
        />
      )}
      {endpoints.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-linha">
            {endpoints.map((w) => (
              <li key={w.id} className="space-y-3 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-all font-mono text-sm">{w.url}</p>
                    <p className="text-sm text-petroleo-soft">{w.app} · desde {dateTime(w.created_at)}</p>
                  </div>
                  {w.enabled ? <StatusBadge tone="ok">Ativo</StatusBadge> : <StatusBadge tone="off">Pausado</StatusBadge>}
                </div>
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => toggle.run(w)}>{w.enabled ? "Pausar envios" : "Retomar envios"}</Button>
                    <Button size="sm" variant="outline" onClick={() => rotate.run(w)}><RotateCw aria-hidden /> Novo segredo</Button>
                    <Button size="sm" variant="ghost" onClick={() => remove.run(w)}><Trash2 aria-hidden /> Excluir</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-extrabold">Entregas recentes</h2>
          <SelectField label="Situação" className="w-48" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas</option>
            <option value="failed">Não entregues</option>
            <option value="pending">Tentando</option>
            <option value="succeeded">Entregues</option>
          </SelectField>
        </div>
        {deliveries.loading && !deliveries.data && <Loading />}
        {deliveries.error && !deliveries.data && <LoadError error={deliveries.error} onRetry={deliveries.reload} />}
        {deliveries.data?.length === 0 && <p className="text-petroleo-soft">Nenhuma entrega registrada.</p>}
        <FormError message={redeliver.error} />
        <ul className="space-y-3">
          {deliveries.data?.map((d) => {
            const s = deliveryStatus[d.status];
            return (
              <li key={d.id}>
                <Card className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{eventLabel[d.type] ?? d.type}</p>
                      <p className="break-all text-sm text-petroleo-soft">{d.url}</p>
                    </div>
                    <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                  </div>
                  <p className="text-sm text-petroleo-soft">
                    {dateTime(d.created_at)} · {d.attempt_count} tentativa(s)
                    {d.last_status_code ? ` · última resposta HTTP ${d.last_status_code}` : ""}
                    {d.next_attempt_at ? ` · próxima tentativa ${dateTime(d.next_attempt_at)}` : ""}
                  </p>
                  {d.last_error && d.status !== "succeeded" && <p className="text-sm">Motivo: {d.last_error}</p>}
                  <div className="flex flex-wrap items-center gap-3">
                    {d.attempts.length > 0 && (
                      <details className="text-sm">
                        <summary className="cursor-pointer font-semibold">Ver tentativas</summary>
                        <ul className="mt-2 space-y-1">
                          {d.attempts.map((a) => (
                            <li key={a.number}>
                              #{a.number} · {dateTime(a.at)} · {a.status_code ? `HTTP ${a.status_code}` : (a.error ?? "sem resposta")}
                              {a.duration_ms != null && ` · ${a.duration_ms} ms`}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {canEdit && d.status === "failed" && (
                      <Button size="sm" variant="outline" disabled={redeliver.busy} onClick={() => redeliver.run(d.id)}><Send aria-hidden /> Reenviar</Button>
                    )}
                  </div>
                  <p className="text-xs text-petroleo-soft">Evento <code className="font-mono">{d.event_id}</code></p>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      {adding && apps.data && (
        <AddEndpoint
          apps={apps.data}
          onClose={() => setAdding(false)}
          onCreated={(s) => {
            setSecret(s);
            setAdding(false);
            apps.reload();
          }}
        />
      )}
    </>
  );
}

function AddEndpoint({ apps, onClose, onCreated }: { apps: Application[]; onClose: () => void; onCreated: (secret: string) => void }) {
  const { base, env } = useOrg();
  const [appId, setAppId] = useState(apps[0]?.id ?? "");
  const [url, setUrl] = useState("");
  const act = useAction(async () => {
    const r = await post<{ secret: string }>(`${base}/applications/${appId}/webhooks`, { url, environment: env });
    onCreated(r.secret);
  });
  return (
    <Drawer open onClose={onClose} title="Novo endereço de aviso" description={`Ambiente: ${env === "live" ? "Produção" : "Teste"}.`}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act.run(); }}>
        <SelectField label="Aplicação" value={appId} onChange={(e) => setAppId(e.target.value)}>
          {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </SelectField>
        <Field
          label="URL do seu servidor"
          type="url"
          required
          placeholder="https://seusite.com.br/webhooks/simvio"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          hint="Precisa ser HTTPS público. Endereços internos ou redirecionamentos são recusados."
        />
        <FormError message={act.error} />
        <Button type="submit" size="lg" className="w-full" disabled={act.busy}>Cadastrar</Button>
        <p className="text-sm text-petroleo-soft">Depois de cadastrar, copie o segredo exibido e valide a assinatura em cada aviso recebido.</p>
      </form>
    </Drawer>
  );
}
