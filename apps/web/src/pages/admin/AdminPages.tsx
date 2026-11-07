import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { Building2, ChevronRight, Search } from "lucide-react";
import { deviceHealthStatus, EmptyState, LoadError, Loading, PageHeader, StatusBadge, verificationStatus, type Tone } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormError, SelectField } from "@/components/ui/form";
import { useAction } from "@/lib/action";
import { dateTime, money, relative, roleLabel } from "@/lib/format";
import { panel, patch, post, useResource } from "@/lib/session";
import type { ApiError } from "@/lib/api";
import type { Health, SubscriptionStatus } from "@/lib/types";
import { auditLabel } from "@/pages/app/Settings";
import { useAdminError } from "./AdminLayout";

interface OrgRow {
  id: string;
  name: string;
  created_at: string;
  suspended: boolean;
  plan: { code: string; name: string } | null;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  usage: { members: number; active_devices: number; live_applications: number };
}

interface OrgDetail {
  id: string;
  name: string;
  created_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  entitlements: { plan_name: string; status: SubscriptionStatus; max_live_applications: number; max_devices: number };
  subscription: { plan_code: string; status: "active" | "suspended" | "cancelled"; current_period_end: string | null; notes: string | null; updated_at: string } | null;
  billing: { asaas_customer_id: string | null; asaas_subscription_id: string | null; plan_code: string | null; invoice_url: string | null; overdue_since: string | null; ends_at: string | null };
  stats: { verified_30d: number; failed_webhooks_30d: number };
  members: { id: string; name: string; email: string; role: keyof typeof roleLabel; email_verified: boolean }[];
  webhooks: { id: string; url: string; environment: string; enabled: boolean; application: string }[];
  verifications: { id: string; application: string; environment: string; phone_masked: string; status: string; failure_reason: string | null; created_at: string }[];
  applications: { id: string; name: string; live_enabled: boolean; archived: boolean }[];
  devices: { id: string; name: string; model: string | null; status: string; health: Health; last_seen_at: string | null; line: { phone_masked: string; status: string } | null }[];
}

interface Plan {
  code: string;
  name: string;
  price_cents: number;
  max_live_applications: number;
  max_devices: number;
  active: boolean;
}

interface AuditItem {
  id: string;
  at: string;
  organization: { id: string; name: string | null } | null;
  actor_type: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: unknown;
}

const subStatus: Record<SubscriptionStatus, { tone: Tone; label: string }> = {
  sandbox: { tone: "wait", label: "Somente teste" },
  active: { tone: "ok", label: "Ativa" },
  suspended: { tone: "error", label: "Suspensa" },
  cancelled: { tone: "off", label: "Cancelada" },
};

function OrgStatus({ suspended, status }: { suspended: boolean; status: SubscriptionStatus }) {
  if (suspended) return <StatusBadge tone="error">Organização suspensa</StatusBadge>;
  const s = subStatus[status];
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

/** Lista paginada por cursor; recarrega do início quando a busca muda. */
export function usePaged<T>(path: string) {
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const onError = useAdminError();

  async function load(cursor?: string) {
    setLoading(true);
    try {
      const sep = path.includes("?") ? "&" : "?";
      const r = await panel<{ data: T[]; next_cursor: string | null }>(cursor ? `${path}${sep}cursor=${cursor}` : path);
      setItems((prev) => (cursor ? [...prev, ...r.data] : r.data));
      setNext(r.next_cursor);
      setError(null);
    } catch (e) {
      setError(e as ApiError);
      onError(e as ApiError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);

  return { items, next, error, loading, reload: () => load(), more: () => next && load(next) };
}

export function AdminOrganizations() {
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const qs = new URLSearchParams({ ...(query ? { q: query } : {}), ...(status ? { status } : {}) }).toString();
  const list = usePaged<OrgRow>(`/admin/organizations${qs ? `?${qs}` : ""}`);

  return (
    <>
      <PageHeader title="Clientes" description="Todas as organizações, com plano e situação. Mudanças ficam no registro de ações." />
      <form
        role="search"
        className="flex max-w-3xl flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(term.trim());
        }}
      >
        <Field label="Buscar por nome, e-mail de membro ou id" className="min-w-56 flex-1" value={term} onChange={(e) => setTerm(e.target.value)} />
        <SelectField label="Situação" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos</option>
          <option value="paying">Com assinatura ativa</option>
          <option value="sandbox">Só teste</option>
          <option value="suspended">Suspensos</option>
        </SelectField>
        <Button type="submit" className="self-end" aria-label="Buscar"><Search aria-hidden /> Buscar</Button>
      </form>
      {list.error && !list.items.length && <LoadError error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && list.items.length === 0 && <EmptyState icon={Building2} title="Nenhum cliente" text={query || status ? "Nada encontrado para essa busca." : "Ainda não há contas cadastradas."} />}
      <ul className="space-y-3">
        {list.items.map((o) => (
          <li key={o.id}>
            <Link to={`/admin/clientes/${o.id}`} className="block">
              <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 hover:border-petroleo">
                <div className="min-w-48 flex-1">
                  <p className="text-lg font-bold">{o.name}</p>
                  <p className="text-sm text-petroleo-soft">Criada em {dateTime(o.created_at)} · {o.plan?.name ?? "Sem plano"}</p>
                </div>
                <OrgStatus suspended={o.suspended} status={o.subscription_status} />
                <p className="text-sm text-petroleo-soft">{o.usage.active_devices} aparelho(s) · {o.usage.live_applications} em produção · {o.usage.members} membro(s)</p>
                <ChevronRight className="size-5" aria-hidden />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {list.loading && <Loading />}
      {list.next && !list.loading && <Button variant="outline" onClick={list.more}>Carregar mais</Button>}
    </>
  );
}

export function AdminOrganization() {
  const { id } = useParams();
  const org = useResource<OrgDetail>(`/admin/organizations/${id}`);
  const plans = useResource<Plan[]>("/admin/plans");
  const onError = useAdminError();
  const [editing, setEditing] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [revoking, setRevoking] = useState<OrgDetail["devices"][number] | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => onError(org.error), [org.error, onError]);

  if (org.loading && !org.data) return <Loading />;
  if (org.error && !org.data) return <LoadError error={org.error} onRetry={org.reload} />;
  const o = org.data;
  if (!o) return null;
  const suspended = !!o.suspended_at;

  return (
    <>
      <Link to="/admin/clientes" className="text-[15px] font-semibold underline underline-offset-4">← Clientes</Link>
      <PageHeader title={o.name} description={`Criada em ${dateTime(o.created_at)} · id ${o.id}`} action={<OrgStatus suspended={suspended} status={o.entitlements.status} />} />
      {suspended && (
        <Notice tone="error">
          <div>
            <p className="font-semibold">Suspensa desde {dateTime(o.suspended_at)}. Novas verificações e novos aparelhos estão bloqueados.</p>
            {o.suspended_reason && <p>Motivo: {o.suspended_reason}</p>}
          </div>
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-xl font-bold">Plano</h2>
          <p className="text-lg"><strong>{o.entitlements.plan_name}</strong> · até {o.entitlements.max_live_applications} aplicação(ões) em produção e {o.entitlements.max_devices} aparelho(s)</p>
          {o.subscription ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
              <dt className="text-petroleo-soft">Situação</dt><dd>{subStatus[o.subscription.status].label}</dd>
              <dt className="text-petroleo-soft">Pago até</dt><dd>{o.subscription.current_period_end ? new Date(o.subscription.current_period_end).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—"}</dd>
              <dt className="text-petroleo-soft">Observação</dt><dd>{o.subscription.notes || "—"}</dd>
              <dt className="text-petroleo-soft">Atualizado</dt><dd>{dateTime(o.subscription.updated_at)}</dd>
            </dl>
          ) : (
            <p className="text-petroleo-soft">Sem assinatura: pode testar, mas não usar produção.</p>
          )}
          {o.billing.asaas_subscription_id ? (
            <p className="text-[15px]">
              Cobrado pelo Asaas (assinatura <code>{o.billing.asaas_subscription_id}</code>)
              {o.billing.overdue_since && <> · <strong className="text-erro">em atraso desde {new Date(o.billing.overdue_since).toLocaleDateString("pt-BR")}</strong></>}
              {o.billing.invoice_url && <> · <a className="font-semibold underline" href={o.billing.invoice_url} target="_blank" rel="noreferrer">fatura aberta</a></>}
            </p>
          ) : o.billing.ends_at ? (
            <p className="text-[15px]">Cancelou a cobrança pelo Asaas; o plano vale até {new Date(o.billing.ends_at).toLocaleDateString("pt-BR")}.</p>
          ) : null}
          <Button variant="outline" onClick={() => setEditing(true)}>Alterar plano</Button>
        </Card>
        <Card className="space-y-3">
          <h2 className="text-xl font-bold">Últimos 30 dias</h2>
          <p className="text-lg">{o.stats.verified_30d} número(s) confirmado(s)</p>
          <p className="text-lg">{o.stats.failed_webhooks_30d} aviso(s) automático(s) não entregue(s)</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant={suspended ? "primary" : "danger"} onClick={() => setSuspending(true)}>{suspended ? "Reativar organização" : "Suspender organização"}</Button>
            <Button variant="outline" onClick={() => setRenaming(true)}>Renomear</Button>
            <Button asChild variant="ghost"><Link to={`/admin/auditoria?org=${o.id}`}>Ver registro de ações</Link></Button>
          </div>
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Aparelhos</h2>
        {o.devices.length === 0 && <p className="text-petroleo-soft">Nenhum aparelho conectado.</p>}
        <ul className="divide-y divide-linha">
          {o.devices.map((d) => {
            const h = deviceHealthStatus[d.health] ?? deviceHealthStatus.offline!;
            return (
              <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                <div className="min-w-48 flex-1">
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-sm text-petroleo-soft">{[d.model, d.line?.phone_masked, `visto ${relative(d.last_seen_at)}`].filter(Boolean).join(" · ")}</p>
                </div>
                <StatusBadge tone={h.tone}>{h.label}</StatusBadge>
                {d.status !== "revoked" && <Button size="sm" variant="danger" onClick={() => setRevoking(d)}>Revogar</Button>}
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-xl font-bold">Equipe</h2>
          <ul className="space-y-2">
            {o.members.map((m) => (
              <li key={m.id}>
                <strong>{m.name}</strong> · {m.email} · {roleLabel[m.role]}{!m.email_verified && " · e-mail não confirmado"}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="space-y-3">
          <h2 className="text-xl font-bold">Aplicações</h2>
          {o.applications.length === 0 && <p className="text-petroleo-soft">Nenhuma aplicação.</p>}
          <ul className="space-y-2">
            {o.applications.map((a) => (
              <li key={a.id}>{a.name} · {a.archived ? "arquivada" : a.live_enabled ? "produção ligada" : "só teste"}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Avisos automáticos</h2>
        {o.webhooks.length === 0 && <p className="text-petroleo-soft">Nenhum endereço cadastrado.</p>}
        <ul className="space-y-2">
          {o.webhooks.map((w) => (
            <li key={w.id} className="break-all">{w.application} · {w.environment === "live" ? "produção" : "teste"} · {w.url} · {w.enabled ? "ligado" : "desligado"}</li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <h2 className="text-xl font-bold">Últimas verificações</h2>
        {o.verifications.length === 0 && <p className="text-petroleo-soft">Nenhuma verificação ainda.</p>}
        <ul className="divide-y divide-linha">
          {o.verifications.map((v) => {
            const st = verificationStatus[v.status] ?? { tone: "off" as const, label: v.status };
            return (
              <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <p className="min-w-48 flex-1">{v.phone_masked} · {v.application} · {v.environment === "live" ? "produção" : "teste"}</p>
                <p className="text-sm text-petroleo-soft">{dateTime(v.created_at)}</p>
                <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="space-y-3 border-erro/40">
        <h2 className="text-xl font-bold">Excluir cliente</h2>
        <p>Apaga a organização, aplicações, aparelhos e histórico. Não pode ser desfeito. Prefira suspender se houver chance de o cliente voltar.</p>
        <div><Button variant="danger" onClick={() => setDeleting(true)}>Excluir cliente</Button></div>
      </Card>

      <RenameDrawer open={renaming} onClose={() => setRenaming(false)} org={o} onSaved={org.reload} />
      <DeleteDrawer open={deleting} onClose={() => setDeleting(false)} org={o} />
      <PlanDrawer open={editing} onClose={() => setEditing(false)} org={o} plans={plans.data ?? []} onSaved={org.reload} />
      <ReasonDrawer
        open={suspending}
        onClose={() => setSuspending(false)}
        title={suspended ? "Reativar organização" : "Suspender organização"}
        description={suspended ? "A organização volta a criar verificações e conectar aparelhos." : "Novas verificações e novos aparelhos ficam bloqueados. Verificações já abertas terminam normalmente."}
        confirmLabel={suspended ? "Reativar" : "Suspender"}
        danger={!suspended}
        onConfirm={async (reason) => {
          await post(`/admin/organizations/${o.id}/${suspended ? "reactivate" : "suspend"}`, { reason });
          org.reload();
        }}
      />
      <ReasonDrawer
        open={!!revoking}
        onClose={() => setRevoking(null)}
        title="Revogar aparelho"
        description={`"${revoking?.name ?? ""}" para de receber SMS na hora. Verificações abertas nele falham. Para voltar, o cliente precisa conectar de novo.`}
        confirmLabel="Revogar aparelho"
        danger
        onConfirm={async (reason) => {
          await post(`/admin/organizations/${o.id}/devices/${revoking!.id}/revoke`, { reason });
          org.reload();
        }}
      />
    </>
  );
}

function RenameDrawer({ open, onClose, org, onSaved }: { open: boolean; onClose: () => void; org: OrgDetail; onSaved: () => void }) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (open) setName(org.name);
  }, [open, org.name]);
  const save = useAction(async () => {
    await patch(`/admin/organizations/${org.id}`, { name: name.trim() });
    onSaved();
    onClose();
  });
  return (
    <Drawer open={open} onClose={onClose} title="Renomear cliente">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run(); }}>
        <Field label="Nome da organização" value={name} minLength={2} maxLength={80} onChange={(e) => setName(e.target.value)} required />
        <FormError message={save.error} />
        <Button type="submit" size="lg" className="w-full" disabled={save.busy || name.trim().length < 2}>Salvar</Button>
      </form>
    </Drawer>
  );
}

function DeleteDrawer({ open, onClose, org }: { open: boolean; onClose: () => void; org: OrgDetail }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) {
      setName("");
      setReason("");
    }
  }, [open]);
  const run = useAction(async () => {
    await post(`/admin/organizations/${org.id}/delete`, { confirm_name: name, reason: reason.trim() });
    navigate("/admin/clientes", { replace: true });
  });
  return (
    <Drawer open={open} onClose={onClose} title="Excluir cliente" description="Tudo desta organização é apagado na hora. Usuários que só pertencem a ela perdem a conta e precisarão se cadastrar de novo.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run.run(); }}>
        <Field label={`Digite "${org.name}" para confirmar`} value={name} autoComplete="off" onChange={(e) => setName(e.target.value)} required />
        <Field label="Motivo (fica no registro de ações)" value={reason} minLength={3} maxLength={500} onChange={(e) => setReason(e.target.value)} required />
        <FormError message={run.error} />
        <Button type="submit" size="lg" variant="danger" className="w-full" disabled={run.busy || name.trim() !== org.name || reason.trim().length < 3}>Excluir definitivamente</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onClose}>Voltar</Button>
      </form>
    </Drawer>
  );
}

function PlanDrawer({ open, onClose, org, plans, onSaved }: { open: boolean; onClose: () => void; org: OrgDetail; plans: Plan[]; onSaved: () => void }) {
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("active");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setPlan(org.subscription?.plan_code ?? "");
    setStatus(org.subscription?.status ?? "active");
    setPeriodEnd(org.subscription?.current_period_end?.slice(0, 10) ?? "");
    setNotes(org.subscription?.notes ?? "");
  }, [open, org]);

  const save = useAction(async () => {
    if (!plan && !confirm("Remover o plano? A organização volta a só poder testar.")) return;
    await panel(`/admin/organizations/${org.id}/subscription`, {
      method: "PUT",
      body: JSON.stringify({ plan_code: plan || null, status, current_period_end: periodEnd || null, notes: notes.trim() || null }),
    });
    onSaved();
    onClose();
  });

  return (
    <Drawer open={open} onClose={onClose} title="Alterar plano" description="Cobrança manual: registre aqui o que foi combinado e pago.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.run();
        }}
      >
        <SelectField label="Plano" value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">Sem plano (somente teste)</option>
          {plans.filter((p) => p.active).map((p) => (
            <option key={p.code} value={p.code}>{p.name} · {money(p.price_cents)}/mês · {p.max_live_applications} app(s) · {p.max_devices} aparelho(s)</option>
          ))}
        </SelectField>
        {plan && (
          <>
            <SelectField label="Situação da assinatura" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Ativa</option>
              <option value="suspended">Suspensa (falta de pagamento)</option>
              <option value="cancelled">Cancelada</option>
            </SelectField>
            <Field label="Pago até" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} hint="Opcional. Só informativo: nada é bloqueado automaticamente nessa data." />
            <Field label="Observação" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} hint="Ex.: Pix recebido em 03/11. Não coloque dados de cartão." />
          </>
        )}
        <FormError message={save.error} />
        <Button type="submit" size="lg" className="w-full" disabled={save.busy}>Salvar</Button>
      </form>
    </Drawer>
  );
}

function ReasonDrawer({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  danger,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const run = useAction(async () => {
    await onConfirm(reason.trim());
    onClose();
  });
  return (
    <Drawer open={open} onClose={onClose} title={title} description={description}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          run.run();
        }}
      >
        <Field label="Motivo (fica no registro de ações)" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} required />
        <FormError message={run.error} />
        <Button type="submit" size="lg" variant={danger ? "danger" : "primary"} className="w-full" disabled={run.busy || reason.trim().length < 3}>{confirmLabel}</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={onClose}>Voltar</Button>
      </form>
    </Drawer>
  );
}

const actionLabel: Record<string, string> = {
  ...auditLabel,
  "admin.organization_suspended": "Organização suspensa",
  "admin.organization_reactivated": "Organização reativada",
  "admin.subscription_changed": "Plano do cliente alterado",
  "admin.login": "Entrada na administração",
  "admin.organization_renamed": "Cliente renomeado",
  "admin.organization_deleted": "Cliente excluído",
  "admin.plan_created": "Plano criado",
  "admin.plan_changed": "Plano editado",
  "admin.user_confirm_email": "E-mail confirmado pela administração",
  "admin.user_resend_confirmation": "Confirmação de e-mail reenviada",
  "admin.user_send_reset": "Link de nova senha enviado",
  "admin.user_end_sessions": "Sessões do usuário encerradas",
  "admin.mfa_enabled": "Autenticador configurado",
  "admin.mfa_failed": "Código do autenticador incorreto",
  "admin.mfa_recovery_used": "Código de recuperação usado",
  "device.revoked": "Aparelho revogado",
};

const actorLabel: Record<string, string> = { superadmin: "Administração", user: "Usuário", device: "Aparelho", system: "Sistema", api_key: "Chave de API" };

export function AdminAudit() {
  const [search, setSearch] = useSearchParams();
  const orgFilter = search.get("org") ?? "";
  const [action, setAction] = useState("");
  const [applied, setApplied] = useState("");
  const params = new URLSearchParams();
  if (orgFilter) params.set("organization_id", orgFilter);
  if (applied) params.set("action", applied);
  const qs = params.toString();
  const list = usePaged<AuditItem>(`/admin/audit-logs${qs ? `?${qs}` : ""}`);

  return (
    <>
      <PageHeader title="Registro de ações" description="Quem fez o quê, e quando. Não guarda senhas, tokens nem números completos." />
      <form
        className="flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(action.trim());
        }}
      >
        <Field label="Filtrar por ação (ex.: admin., device.)" className="flex-1" value={action} onChange={(e) => setAction(e.target.value)} />
        <Button type="submit" className="self-end">Filtrar</Button>
      </form>
      {orgFilter && <p className="text-[15px]">Mostrando só uma organização. <button type="button" onClick={() => setSearch({})} className="font-semibold underline">Ver todas</button></p>}
      {list.error && !list.items.length && <LoadError error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && list.items.length === 0 && <p className="text-petroleo-soft">Nenhum registro.</p>}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-[15px]">
          <thead className="border-b border-linha text-sm text-petroleo-soft">
            <tr><th className="p-3 font-semibold">Quando</th><th className="p-3 font-semibold">Ação</th><th className="p-3 font-semibold">Organização</th><th className="p-3 font-semibold">Quem</th></tr>
          </thead>
          <tbody className="divide-y divide-linha">
            {list.items.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="whitespace-nowrap p-3">{dateTime(a.at)}</td>
                <td className="p-3">
                  <p className="font-semibold">{actionLabel[a.action] ?? a.action}</p>
                  {a.metadata != null && <code className="mt-1 block max-w-md break-all text-xs text-petroleo-soft">{JSON.stringify(a.metadata)}</code>}
                </td>
                <td className="p-3">{a.organization ? <Link className="underline" to={`/admin/clientes/${a.organization.id}`}>{a.organization.name ?? a.organization.id}</Link> : "—"}</td>
                <td className="p-3">{actorLabel[a.actor_type] ?? a.actor_type}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {list.loading && <Loading />}
      {list.next && !list.loading && <Button variant="outline" onClick={list.more}>Carregar mais</Button>}
    </>
  );
}
