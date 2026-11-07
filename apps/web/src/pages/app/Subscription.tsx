import { useEffect, useState } from "react";
import { LoadError, Loading, PageHeader, StatusBadge, type Tone } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormError } from "@/components/ui/form";
import { useOrg } from "@/layouts/AppShell";
import { useAction } from "@/lib/action";
import { money } from "@/lib/format";
import { post, useResource, useSession } from "@/lib/session";
import type { Subscription, SubscriptionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const statusLabel: Record<SubscriptionStatus, { tone: Tone; label: string }> = {
  sandbox: { tone: "wait", label: "Somente teste" },
  active: { tone: "ok", label: "Ativa" },
  suspended: { tone: "error", label: "Suspensa" },
  cancelled: { tone: "off", label: "Cancelada" },
};

// Contato opcional configurado no build; sem ele, a tela apenas orienta.
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL as string | undefined;

const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

function Usage({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between gap-2 text-[15px]"><span>{label}</span><strong>{used} de {limit}</strong></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-mineral" role="presentation">
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-alerta" : "bg-petroleo")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type Plan = Subscription["plans"][number];

/** Primeira assinatura pede os dados de cobrança; na troca de plano o cliente já existe no Asaas. */
function CheckoutDrawer({ plan, change, onClose, onDone }: { plan: Plan | null; change: boolean; onClose: () => void; onDone: () => void }) {
  const { base, orgName } = useOrg();
  const { me } = useSession();
  const [doc, setDoc] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (plan) {
      setName(orgName);
      setEmail(me?.user.email ?? "");
    }
  }, [plan, orgName, me?.user.email]);
  const run = useAction(async () => {
    const res = await post<{ invoice_url: string | null }>(`${base}/billing/checkout`, change ? { plan_code: plan!.code } : { plan_code: plan!.code, cpf_cnpj: doc, name: name.trim(), email: email.trim() });
    if (!change && res.invoice_url) window.location.assign(res.invoice_url);
    else {
      onDone();
      onClose();
    }
  });
  if (!plan) return null;
  return (
    <Drawer
      open
      onClose={onClose}
      title={change ? `Mudar para o plano ${plan.name}` : `Assinar o plano ${plan.name}`}
      description={change ? "Os limites do novo plano valem agora. O novo valor entra na próxima mensalidade." : "Você vai para a fatura do Asaas e escolhe Pix, boleto ou cartão. A produção é liberada assim que o pagamento for confirmado."}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run.run(); }}>
        <p className="text-lg"><strong>{money(plan.price_cents)}</strong> por mês</p>
        {!change && (
          <>
            <Field label="CPF ou CNPJ" value={doc} inputMode="numeric" autoComplete="off" maxLength={18} onChange={(e) => setDoc(e.target.value)} required />
            <Field label="Nome ou razão social" value={name} minLength={2} maxLength={120} onChange={(e) => setName(e.target.value)} required />
            <Field label="E-mail para receber as faturas" type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} required />
          </>
        )}
        <FormError message={run.error} />
        <Button type="submit" size="lg" className="w-full" disabled={run.busy}>{change ? "Confirmar mudança" : "Ir para o pagamento"}</Button>
      </form>
    </Drawer>
  );
}

export default function SubscriptionPage() {
  const { base, orgName, isOwner } = useOrg();
  const { data, error, loading, reload } = useResource<Subscription>(`${base}/subscription`);
  const [choosing, setChoosing] = useState<Plan | null>(null);
  const sync = useAction(async () => {
    await post(`${base}/billing/sync`);
    reload();
  });
  const cancel = useAction(async () => {
    await post(`${base}/billing/cancel`);
    reload();
  });

  if (loading && !data) return <Loading />;
  if (error && !data) return <LoadError error={error} onRetry={reload} />;
  if (!data) return null;
  const s = statusLabel[data.status];
  const b = data.billing;
  const billedPlan = b.active ? b.plan_code : null;
  const subject = encodeURIComponent(`Mudança de plano — ${orgName}`);

  const payButton = b.invoice_url && (
    <div className="flex flex-wrap gap-2">
      <Button asChild><a href={b.invoice_url} target="_blank" rel="noreferrer">Pagar fatura</a></Button>
      <Button variant="outline" disabled={sync.busy} onClick={() => sync.run()}>Já paguei, atualizar</Button>
    </div>
  );

  return (
    <>
      <PageHeader title="Assinatura" description="Mensalidade fixa. Sem créditos por mensagem e sem cobrança por verificação." />
      {data.status === "suspended" && b.overdue_since ? (
        <Notice tone="error" className="space-y-3">
          <p>A mensalidade venceu em {day(b.overdue_since)} e a produção está bloqueada. Ela volta assim que o pagamento for confirmado.</p>
          {payButton}
        </Notice>
      ) : data.status === "suspended" ? (
        <Notice tone="error"><p>A assinatura está suspensa e novas verificações estão bloqueadas. Fale com a equipe Simvio para regularizar.</p></Notice>
      ) : b.overdue_since ? (
        <Notice tone="warn" className="space-y-3">
          <p>A mensalidade venceu em {day(b.overdue_since)}. Pague até {day(b.blocks_at!)} para a produção não ser bloqueada.</p>
          {payButton}
        </Notice>
      ) : b.invoice_url && data.status !== "active" ? (
        <Notice className="space-y-3">
          <p>Sua fatura está aberta. A produção é liberada assim que o pagamento for confirmado (Pix e cartão costumam levar poucos minutos; boleto, até 3 dias úteis).</p>
          {payButton}
        </Notice>
      ) : null}
      {!b.active && b.ends_at && new Date(b.ends_at) > new Date() && (
        <Notice><p>Assinatura cancelada. O plano continua valendo até {day(b.ends_at)}.</p></Notice>
      )}
      <FormError message={sync.error ?? cancel.error} />

      <Card className="space-y-5 lg:max-w-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm text-petroleo-soft">Plano atual</p>
            <h2 className="text-2xl font-extrabold">{data.plan_name}</h2>
          </div>
          <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
        </div>
        <Usage label="Aplicações em produção" used={data.usage.live_applications} limit={data.limits.live_applications} />
        <Usage label="Aparelhos conectados" used={data.usage.devices} limit={data.limits.devices} />
        <p className="text-sm text-petroleo-soft">O ambiente de Teste não conta como aplicação em produção.</p>
      </Card>

      <section className="space-y-4">
        <h2 className="text-2xl font-extrabold">Planos</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {data.plans.map((p) => {
            const current = p.code === (billedPlan ?? data.plan_code);
            return (
              <Card key={p.code} className={cn("flex flex-col gap-3", current && "border-2 border-petroleo")}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xl font-bold">{p.name}</h3>
                  {current && <StatusBadge tone="ok">Seu plano</StatusBadge>}
                </div>
                <p><span className="text-3xl font-extrabold">{money(p.price_cents)}</span> <span className="text-petroleo-soft">/mês</span></p>
                <ul className="flex-1 space-y-1 text-[15px]">
                  <li>{p.live_applications} aplicação(ões) em produção</li>
                  <li>{p.devices} aparelho(s) receptor(es)</li>
                  <li>Ambiente de teste incluído</li>
                </ul>
                {b.enabled && isOwner && !current && (
                  <Button variant={b.active ? "outline" : "primary"} onClick={() => setChoosing(p)}>{b.active ? "Mudar para este plano" : "Assinar"}</Button>
                )}
              </Card>
            );
          })}
        </div>
        <p className="text-sm text-petroleo-soft">O envio do SMS pode ser cobrado pela operadora do usuário.</p>
      </section>

      {b.enabled ? (
        <Card className="space-y-3 lg:max-w-2xl">
          <h2 className="text-xl font-bold">Pagamento</h2>
          <p className="text-[15px]">
            A cobrança é feita pelo Asaas, todo mês, com Pix, boleto ou cartão à sua escolha na fatura. A fatura também chega por e-mail.
          </p>
          {!isOwner ? (
            <p className="text-[15px] font-semibold">Só um proprietário da organização pode assinar, mudar de plano ou cancelar.</p>
          ) : b.active ? (
            <Button
              variant="outline"
              disabled={cancel.busy}
              onClick={() => {
                if (confirm("Cancelar a assinatura? Não haverá novas cobranças e o plano vale até o fim do período já pago.")) cancel.run();
              }}
            >
              Cancelar assinatura
            </Button>
          ) : null}
        </Card>
      ) : (
        <Card className="space-y-3 lg:max-w-2xl">
          <h2 className="text-xl font-bold">Mudar de plano</h2>
          <p className="text-[15px]">A contratação e as mudanças de plano são feitas pela equipe Simvio.</p>
          {isOwner && SUPPORT_EMAIL ? (
            <a className="inline-flex min-h-11 items-center rounded-xl bg-lima px-4 font-bold hover:bg-lima-600" href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`}>
              Solicitar mudança
            </a>
          ) : (
            <p className="text-[15px] font-semibold">{isOwner ? "Solicite a mudança pelo canal de atendimento informado na sua contratação." : "Peça a um proprietário da organização para solicitar a mudança."}</p>
          )}
        </Card>
      )}

      <CheckoutDrawer plan={choosing} change={b.active} onClose={() => setChoosing(null)} onDone={reload} />
    </>
  );
}
