import { LoadError, Loading, PageHeader, StatusBadge, type Tone } from "@/components/common";
import { Card, Notice } from "@/components/ui/card";
import { useOrg } from "@/layouts/AppShell";
import { money } from "@/lib/format";
import { useResource } from "@/lib/session";
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

export default function SubscriptionPage() {
  const { base, orgName, isOwner } = useOrg();
  const { data, error, loading, reload } = useResource<Subscription>(`${base}/subscription`);

  if (loading && !data) return <Loading />;
  if (error && !data) return <LoadError error={error} onRetry={reload} />;
  if (!data) return null;
  const s = statusLabel[data.status];

  const subject = encodeURIComponent(`Mudança de plano — ${orgName}`);

  return (
    <>
      <PageHeader title="Assinatura" description="Mensalidade fixa. Sem créditos por mensagem e sem cobrança por verificação." />
      {data.status === "suspended" && <Notice tone="error"><p>A assinatura está suspensa e novas verificações estão bloqueadas. Fale com a equipe Simvio para regularizar.</p></Notice>}

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
            const current = p.code === data.plan_code;
            return (
              <Card key={p.code} className={cn("space-y-3", current && "border-2 border-petroleo")}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xl font-bold">{p.name}</h3>
                  {current && <StatusBadge tone="ok">Seu plano</StatusBadge>}
                </div>
                <p><span className="text-3xl font-extrabold">{money(p.price_cents)}</span> <span className="text-petroleo-soft">/mês</span></p>
                <ul className="space-y-1 text-[15px]">
                  <li>{p.live_applications} aplicação(ões) em produção</li>
                  <li>{p.devices} aparelho(s) receptor(es)</li>
                  <li>Ambiente de teste incluído</li>
                </ul>
              </Card>
            );
          })}
        </div>
        <p className="text-sm text-petroleo-soft">Valores de referência do piloto. O envio do SMS pode ser cobrado pela operadora do usuário.</p>
      </section>

      <Card className="space-y-3 lg:max-w-2xl">
        <h2 className="text-xl font-bold">Mudar de plano</h2>
        <p className="text-[15px]">
          Durante o piloto, a contratação e as mudanças de plano são feitas manualmente pela equipe Simvio, com confirmação de pagamento fora do painel.
          Nenhuma cobrança é feita por aqui.
        </p>
        {isOwner && SUPPORT_EMAIL ? (
          <a className="inline-flex min-h-11 items-center rounded-xl bg-lima px-4 font-bold hover:bg-lima-600" href={`mailto:${SUPPORT_EMAIL}?subject=${subject}`}>
            Solicitar mudança
          </a>
        ) : (
          <p className="text-[15px] font-semibold">{isOwner ? "Solicite a mudança pelo canal de atendimento informado na sua contratação." : "Peça a um proprietário da organização para solicitar a mudança."}</p>
        )}
      </Card>
    </>
  );
}
