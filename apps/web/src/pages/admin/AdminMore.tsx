import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router";
import { Search, ShieldCheck, Users } from "lucide-react";
import { Logo } from "@/components/brand";
import { EmptyState, LoadError, Loading, PageHeader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormError, PasswordField, SelectField } from "@/components/ui/form";
import { useAction } from "@/lib/action";
import { api, ApiError } from "@/lib/api";
import { dateTime, money, relative, roleLabel } from "@/lib/format";
import { panel, post, useResource, useSession } from "@/lib/session";
import { useAdminError } from "./AdminLayout";
import { usePaged } from "./AdminPages";

/** Entrada exclusiva da administração: sem cadastro e com visual próprio, para não se confundir com o login de clientes. */
export function AdminLogin() {
  const { me, loading, refresh } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  const login = useAction(async () => {
    setUnverified(false);
    try {
      await api("/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
    } catch (e) {
      if (e instanceof ApiError && e.details?.reason === "email_not_verified") setUnverified(true);
      throw e;
    }
    await refresh();
  });
  const resend = useAction(async () => {
    await api("/auth/resend-verification", { method: "POST", body: JSON.stringify({ email }) });
    setResent(true);
  });

  if (loading) return <div className="min-h-dvh bg-petroleo" />;
  if (me) return <Navigate to={me.user.is_super_admin ? "/admin" : "/app"} replace />;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-petroleo px-4 py-10">
      <Link to="/" aria-label="Página inicial"><Logo negative className="h-12" /></Link>
      <Card className="w-full max-w-md space-y-5">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-bold text-petroleo-soft"><ShieldCheck className="size-5" aria-hidden /> Administração da Simvio</p>
          <h1 className="text-3xl font-extrabold tracking-tight">Entrar</h1>
          <p className="text-petroleo-soft">Acesso restrito. Clientes entram pelo <Link to="/entrar" className="font-semibold underline underline-offset-4">painel da organização</Link>.</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            login.run();
          }}
        >
          <Field label="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordField label="Senha" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <FormError message={login.error} />
          {unverified && (
            <Notice tone="info" className="flex-col">
              <p>Confirme seu e-mail pelo link que enviamos antes de entrar.</p>
              {resent ? (
                <p className="font-semibold">Um novo link foi enviado.</p>
              ) : (
                <Button type="button" size="sm" variant="outline" disabled={resend.busy} onClick={() => resend.run()}>Enviar novo link</Button>
              )}
            </Notice>
          )}
          <Button type="submit" size="lg" className="w-full" disabled={login.busy}>{login.busy ? "Entrando…" : "Entrar na administração"}</Button>
        </form>
        <p className="text-[15px]"><Link to="/recuperar-senha" className="font-semibold underline underline-offset-4">Esqueci minha senha</Link></p>
      </Card>
    </main>
  );
}

interface Overview {
  organizations: { total: number; suspended: number; paying: number; signups_7d: number };
  monthly_revenue_cents: number;
  users: { total: number; unverified: number };
  devices: { active: number; offline: number };
  verifications_30d: { created: number; verified: number };
  failed_webhooks_30d: number;
  recent_organizations: { id: string; name: string; created_at: string }[];
  offline_devices: { id: string; name: string; last_seen_at: string | null; organization: { id: string; name: string } }[];
}

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="border-l-2 border-lima-600 pl-4">
      <dt className="text-[15px] text-petroleo-soft">{label}</dt>
      <dd className="text-3xl font-extrabold tracking-tight">{value}</dd>
      {note && <dd className="text-sm text-petroleo-soft">{note}</dd>}
    </div>
  );
}

export function AdminOverview() {
  const res = useResource<Overview>("/admin/overview");
  const onError = useAdminError();
  useEffect(() => onError(res.error), [res.error, onError]);

  if (res.loading && !res.data) return <Loading />;
  if (res.error && !res.data) return <LoadError error={res.error} onRetry={res.reload} />;
  const o = res.data;
  if (!o) return null;

  return (
    <>
      <PageHeader title="Visão geral" description="Como está a Simvio agora, somando todos os clientes." />
      <Card>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-7 lg:grid-cols-4">
          <Stat label="Mensalidades ativas" value={money(o.monthly_revenue_cents)} note={`${o.organizations.paying} assinatura(s), valor de tabela`} />
          <Stat label="Clientes" value={o.organizations.total} note={`${o.organizations.signups_7d} novo(s) em 7 dias · ${o.organizations.suspended} suspenso(s)`} />
          <Stat label="Usuários" value={o.users.total} note={`${o.users.unverified} sem confirmar o e-mail`} />
          <Stat label="Aparelhos conectados" value={o.devices.active} note={`${o.devices.offline} sem comunicação`} />
          <Stat label="Verificações em 30 dias" value={o.verifications_30d.created} note={`${o.verifications_30d.verified} confirmada(s)`} />
          <Stat label="Avisos não entregues em 30 dias" value={o.failed_webhooks_30d} />
        </dl>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-3">
          <h2 className="text-xl font-bold">Aparelhos sem comunicação</h2>
          {o.offline_devices.length === 0 && <p className="text-petroleo-soft">Todos os aparelhos estão comunicando.</p>}
          <ul className="divide-y divide-linha">
            {o.offline_devices.map((d) => (
              <li key={d.id} className="py-2.5">
                <Link to={`/admin/clientes/${d.organization.id}`} className="font-semibold underline underline-offset-4">{d.organization.name}</Link>
                <p className="text-sm text-petroleo-soft">{d.name} · visto {relative(d.last_seen_at)}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="space-y-3">
          <h2 className="text-xl font-bold">Clientes mais recentes</h2>
          {o.recent_organizations.length === 0 && <p className="text-petroleo-soft">Ainda não há clientes.</p>}
          <ul className="divide-y divide-linha">
            {o.recent_organizations.map((c) => (
              <li key={c.id} className="py-2.5">
                <Link to={`/admin/clientes/${c.id}`} className="font-semibold underline underline-offset-4">{c.name}</Link>
                <p className="text-sm text-petroleo-soft">{dateTime(c.created_at)}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  is_super_admin: boolean;
  created_at: string;
  last_login_at: string | null;
  organizations: { id: string; name: string; role: keyof typeof roleLabel }[];
}

export function AdminUsers() {
  const { me } = useSession();
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const list = usePaged<UserRow>(`/admin/users${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  const [done, setDone] = useState("");
  const act = useAction(async (id: string, action: string, message: string) => {
    setDone("");
    await post(`/admin/users/${id}/${action}`);
    setDone(message);
    list.reload();
  });

  return (
    <>
      <PageHeader title="Usuários" description="Todas as pessoas com conta na Simvio. A senha nunca é vista: envie um link para a própria pessoa criar outra." />
      <form
        role="search"
        className="flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(term.trim());
        }}
      >
        <Field label="Buscar por nome ou e-mail" className="flex-1" value={term} onChange={(e) => setTerm(e.target.value)} />
        <Button type="submit" className="self-end"><Search aria-hidden /> Buscar</Button>
      </form>
      {done && <Notice tone="success">{done}</Notice>}
      <FormError message={act.error} />
      {list.error && !list.items.length && <LoadError error={list.error} onRetry={list.reload} />}
      {!list.loading && !list.error && list.items.length === 0 && <EmptyState icon={Users} title="Nenhum usuário" text="Nada encontrado para essa busca." />}
      <ul className="space-y-3">
        {list.items.map((u) => (
          <li key={u.id}>
            <Card className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="min-w-56 flex-1">
                  <p className="break-all text-lg font-bold">{u.email}</p>
                  <p className="text-sm text-petroleo-soft">{u.name} · criado em {dateTime(u.created_at)} · último acesso {u.last_login_at ? relative(u.last_login_at) : "nunca"}</p>
                </div>
                {u.is_super_admin && <StatusBadge tone="ok">Superadmin</StatusBadge>}
                <StatusBadge tone={u.email_verified ? "ok" : "wait"}>{u.email_verified ? "E-mail confirmado" : "E-mail não confirmado"}</StatusBadge>
              </div>
              {u.organizations.length > 0 && (
                <p className="text-[15px]">
                  {u.organizations.map((o, i) => (
                    <span key={o.id}>{i > 0 && " · "}<Link to={`/admin/clientes/${o.id}`} className="underline underline-offset-4">{o.name}</Link> ({roleLabel[o.role]})</span>
                  ))}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {!u.email_verified && (
                  <>
                    <Button size="sm" variant="outline" disabled={act.busy} onClick={() => act.run(u.id, "resend-confirmation", `Novo link de confirmação enviado para ${u.email}.`)}>Reenviar confirmação</Button>
                    <Button size="sm" variant="outline" disabled={act.busy} onClick={() => confirm(`Confirmar o e-mail de ${u.email} sem o link? Faça isso só se tiver certeza de que a pessoa é dona do endereço.`) && act.run(u.id, "confirm-email", `E-mail de ${u.email} confirmado.`)}>Confirmar e-mail</Button>
                  </>
                )}
                <Button size="sm" variant="outline" disabled={act.busy} onClick={() => act.run(u.id, "send-reset", `Link de nova senha enviado para ${u.email}.`)}>Enviar link de nova senha</Button>
                {u.id !== me?.user.id && (
                  <Button size="sm" variant="ghost" disabled={act.busy} onClick={() => confirm(`Encerrar todas as sessões de ${u.email}?`) && act.run(u.id, "end-sessions", `Sessões de ${u.email} encerradas.`)}>Encerrar sessões</Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {list.loading && <Loading />}
      {list.next && !list.loading && <Button variant="outline" onClick={list.more}>Carregar mais</Button>}
    </>
  );
}

interface PlanRow {
  code: string;
  name: string;
  price_cents: number;
  max_live_applications: number;
  max_devices: number;
  active: boolean;
  subscribers: number;
}

const EMPTY_PLAN = { code: "", name: "", price: "", apps: "1", devices: "1", active: "true" };

export function AdminPlans() {
  const plans = useResource<PlanRow[]>("/admin/plans");
  const onError = useAdminError();
  useEffect(() => onError(plans.error), [plans.error, onError]);
  // null: fechado; code vazio: plano novo.
  const [editing, setEditing] = useState<PlanRow | "new" | null>(null);

  if (plans.loading && !plans.data) return <Loading />;
  if (plans.error && !plans.data) return <LoadError error={plans.error} onRetry={plans.reload} />;

  return (
    <>
      <PageHeader
        title="Planos"
        description="Limites novos valem na hora para quem já assina. Os preços da página inicial são fixos no site e não mudam por aqui."
        action={<Button onClick={() => setEditing("new")}>Novo plano</Button>}
      />
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-left text-[15px]">
          <thead className="border-b border-linha text-sm text-petroleo-soft">
            <tr><th className="p-3 font-semibold">Plano</th><th className="p-3 font-semibold">Mensalidade</th><th className="p-3 font-semibold">Em produção</th><th className="p-3 font-semibold">Aparelhos</th><th className="p-3 font-semibold">Assinantes</th><th className="p-3 font-semibold">Situação</th><th className="p-3" /></tr>
          </thead>
          <tbody className="divide-y divide-linha">
            {plans.data?.map((p) => (
              <tr key={p.code}>
                <td className="p-3"><p className="font-semibold">{p.name}</p><p className="text-sm text-petroleo-soft">{p.code}</p></td>
                <td className="p-3">{money(p.price_cents)}</td>
                <td className="p-3">{p.max_live_applications}</td>
                <td className="p-3">{p.max_devices}</td>
                <td className="p-3">{p.subscribers}</td>
                <td className="p-3"><StatusBadge tone={p.active ? "ok" : "off"}>{p.active ? "Disponível" : "Desativado"}</StatusBadge></td>
                <td className="p-3 text-right"><Button size="sm" variant="outline" onClick={() => setEditing(p)}>Editar</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <PlanEditor target={editing} onClose={() => setEditing(null)} onSaved={plans.reload} />
    </>
  );
}

function PlanEditor({ target, onClose, onSaved }: { target: PlanRow | "new" | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(EMPTY_PLAN);
  const isNew = target === "new";
  useEffect(() => {
    if (!target) return;
    setF(
      target === "new"
        ? EMPTY_PLAN
        : { code: target.code, name: target.name, price: (target.price_cents / 100).toFixed(2).replace(".", ","), apps: String(target.max_live_applications), devices: String(target.max_devices), active: String(target.active) },
    );
  }, [target]);
  const set = (k: keyof typeof EMPTY_PLAN) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const save = useAction(async () => {
    const cents = Math.round(Number(f.price.replace(/\./g, "").replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) throw new Error("Digite a mensalidade em reais, como 79,00.");
    const body = { name: f.name.trim(), price_cents: cents, max_live_applications: Number(f.apps), max_devices: Number(f.devices), active: f.active === "true" };
    if (isNew) await post("/admin/plans", { code: f.code.trim(), ...body });
    else await panel(`/admin/plans/${f.code}`, { method: "PUT", body: JSON.stringify(body) });
    onSaved();
    onClose();
  });

  return (
    <Drawer open={!!target} onClose={onClose} title={isNew ? "Novo plano" : "Editar plano"} description="Toda alteração fica no registro de ações.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run(); }}>
        {isNew && <Field label="Código" value={f.code} onChange={set("code")} hint="Letras minúsculas, números e hífen. Não pode ser mudado depois." required />}
        <Field label="Nome" value={f.name} onChange={set("name")} required />
        <Field label="Mensalidade (R$)" inputMode="decimal" value={f.price} onChange={set("price")} required />
        <Field label="Aplicações em produção" type="number" min={0} value={f.apps} onChange={set("apps")} required />
        <Field label="Aparelhos" type="number" min={0} value={f.devices} onChange={set("devices")} required />
        <SelectField label="Situação" value={f.active} onChange={set("active")}>
          <option value="true">Disponível para novos clientes</option>
          <option value="false">Desativado (assinantes atuais continuam)</option>
        </SelectField>
        <FormError message={save.error} />
        <Button type="submit" size="lg" className="w-full" disabled={save.busy}>Salvar</Button>
      </form>
    </Drawer>
  );
}
