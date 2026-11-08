import { Link } from "react-router";
import { ArrowRight, Bell, CheckCircle2, Circle, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { deviceHealthStatus, LoadError, Loading, PageHeader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import { useOrg } from "@/layouts/AppShell";
import { failureLabel, relative } from "@/lib/format";
import { useResource } from "@/lib/session";
import type { Overview } from "@/lib/types";

const STEPS: { key: keyof Overview["steps"]; title: string; text: string; to: string }[] = [
  { key: "application", title: "Crie uma aplicação", text: "Representa o site ou app que vai verificar números.", to: "/app/aplicacoes" },
  { key: "api_key", title: "Gere uma chave secreta", text: "Ela fica só no servidor da sua aplicação.", to: "/app/aplicacoes" },
  { key: "device", title: "Conecte um Android", text: "Instale o app Simvio e leia o QR do painel.", to: "/app/aparelhos" },
  { key: "line", title: "Confirme o número do chip", text: "O próprio aparelho confirma a linha com um SMS de teste enviado por você.", to: "/app/aparelhos" },
  { key: "first_verification", title: "Faça a primeira verificação real", text: "Use o teste da aplicação e envie o SMS do seu celular.", to: "/app/aplicacoes" },
];

export default function OverviewPage() {
  const { base, orgName } = useOrg();
  const { data, error, loading, reload } = useResource<Overview>(`${base}/overview`, { interval: 20_000 });

  if (loading && !data) return <Loading />;
  if (error && !data) return <LoadError error={error} onRetry={reload} />;
  if (!data) return null;

  const done = Object.values(data.steps).filter(Boolean).length;

  return (
    <>
      <PageHeader title="Início" description={orgName} />

      {data.subscription_status === "suspended" && (
        <Notice tone="error"><XCircle className="size-5 shrink-0" aria-hidden /><p>A assinatura está suspensa. Novas verificações estão bloqueadas até a regularização. <Link to="/app/assinatura" className="font-semibold underline">Ver assinatura</Link></p></Notice>
      )}

      <section className="rounded-3xl bg-petroleo p-6 text-white sm:p-8">
        <div className="flex flex-wrap items-center gap-5">
          <span className={`flex size-16 shrink-0 items-center justify-center rounded-full ${data.ready ? "bg-lima text-petroleo" : "bg-white/10 text-lima"}`}>
            {data.ready ? <CheckCircle2 className="size-9" aria-hidden /> : <ShieldCheck className="size-9" aria-hidden />}
          </span>
          <div className="min-w-60 flex-1 space-y-1">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{data.ready ? "Pronto para verificar" : "Ainda não está pronto para verificar"}</h2>
            <p className="text-lg text-white/85">
              {data.ready
                ? "Há um aparelho comunicando com a linha confirmada e uma chave ativa."
                : "Siga os passos abaixo para receber a primeira verificação."}
            </p>
          </div>
          <p className="text-white/85"><strong className="block text-4xl font-extrabold text-lima">{data.verified_total}</strong> verificações confirmadas</p>
        </div>
        {data.ready && <p className="mt-4 text-sm text-white/70">“Comunicando” indica contato recente do app, não garante a recepção de SMS. Faça um teste real quando trocar chip ou aparelho.</p>}
      </section>

      {done < STEPS.length && (
        <Card className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">Primeiros passos</h2>
            <p className="text-petroleo-soft">{done} de {STEPS.length} concluídos</p>
            <div role="progressbar" aria-label="Progresso dos primeiros passos" aria-valuemin={0} aria-valuemax={STEPS.length} aria-valuenow={done} className="mt-3 h-2 overflow-hidden rounded-full bg-mineral">
              <div className="h-full rounded-full bg-lima-600" style={{ width: `${(done / STEPS.length) * 100}%` }} />
            </div>
          </div>
          <ol className="space-y-2">
            {STEPS.map((s, i) => {
              const ok = data.steps[s.key];
              return (
                <li key={s.key}>
                  <Link to={s.to} className="flex items-start gap-3 rounded-xl p-3 hover:bg-mineral">
                    {ok ? <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-sucesso" aria-hidden /> : <Circle className="mt-0.5 size-6 shrink-0 text-petroleo-soft" aria-hidden />}
                    <span>
                      <span className="block font-semibold">{i + 1}. {s.title} <span className="sr-only">{ok ? "(concluído)" : "(pendente)"}</span></span>
                      <span className="block text-petroleo-soft">{s.text}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-xl font-bold"><Smartphone className="size-5" aria-hidden /> Aparelhos que precisam de atenção</h2>
          </div>
          {data.problem_devices.length === 0 ? (
            <p className="text-petroleo-soft">Nenhum problema no momento.</p>
          ) : (
            <ul className="divide-y divide-linha">
              {data.problem_devices.map((d) => {
                const h = deviceHealthStatus[d.health] ?? deviceHealthStatus.offline!;
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-semibold">{d.name}</p>
                      <p className="text-sm text-petroleo-soft">
                        Último contato {relative(d.last_seen_at)} · {d.line_status === "active" ? "linha confirmada" : "linha não confirmada"}{d.sms_permission_denied && " · sem permissão de SMS no Android"}
                      </p>
                    </div>
                    <StatusBadge tone={h.tone}>{h.label}</StatusBadge>
                  </li>
                );
              })}
            </ul>
          )}
          <Button asChild variant="outline" size="sm"><Link to="/app/aparelhos">Ver aparelhos <ArrowRight aria-hidden /></Link></Button>
        </Card>

        <Card className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-bold"><XCircle className="size-5" aria-hidden /> Falhas nas últimas 24 horas</h2>
          {data.failed_verifications.length === 0 ? (
            <p className="text-petroleo-soft">Nenhuma verificação falhou.</p>
          ) : (
            <ul className="divide-y divide-linha">
              {data.failed_verifications.map((v) => (
                <li key={v.id} className="flex flex-wrap justify-between gap-2 py-3">
                  <span className="font-semibold">{v.phone}</span>
                  <span className="text-sm text-petroleo-soft">{(v.reason && failureLabel[v.reason]) || "Falhou"} · {relative(v.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
          {data.failed_webhooks_24h > 0 && (
            <Notice tone="warn">
              <Bell className="size-5 shrink-0" aria-hidden />
              <p>{data.failed_webhooks_24h} aviso(s) automático(s) não foram entregues ao seu servidor. <Link to="/app/avisos" className="font-semibold underline">Ver entregas</Link></p>
            </Notice>
          )}
        </Card>
      </div>
    </>
  );
}
