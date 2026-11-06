import { useState } from "react";
import { ExternalLink, KeyRound, LayoutGrid, Plus, RotateCw, Trash2 } from "lucide-react";
import { CodeBlock, CopyButton, EmptyState, LoadError, Loading, PageHeader, SecretOnce, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormError } from "@/components/ui/form";
import { useOrg } from "@/layouts/AppShell";
import { useAction } from "@/lib/action";
import { dateTime, relative } from "@/lib/format";
import { patch, post, useResource } from "@/lib/session";
import type { ApiKey, Application, CreatedVerification } from "@/lib/types";
import { cn } from "@/lib/utils";

const envLabel = { test: "Teste", live: "Produção" } as const;

export default function ApplicationsPage() {
  const { base, canEdit, env } = useOrg();
  const { data, error, loading, reload } = useResource<Application[]>(`${base}/applications`);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = data?.find((a) => a.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Aplicações"
        description="Cada aplicação tem chaves e avisos próprios para Teste e Produção."
        action={canEdit && <Button onClick={() => setCreating(true)}><Plus aria-hidden /> Nova aplicação</Button>}
      />
      {loading && !data && <Loading />}
      {error && !data && <LoadError error={error} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState
          icon={LayoutGrid}
          title="Nenhuma aplicação ainda"
          text="Crie uma aplicação para gerar a chave secreta usada pelo seu servidor."
          action={canEdit && <Button onClick={() => setCreating(true)}><Plus aria-hidden /> Criar aplicação</Button>}
        />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((a) => {
          const keys = a.keys.filter((k) => k.environment === env && !k.revoked_at);
          return (
            <Card key={a.id} className="flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold">{a.name}</h2>
                  <p className="truncate text-petroleo-soft">Nome exibido ao usuário: {a.display_name}</p>
                </div>
                {a.live_enabled ? <StatusBadge tone="ok">Produção ativa</StatusBadge> : <StatusBadge tone="off">Só teste</StatusBadge>}
              </div>
              <p className="text-[15px] text-petroleo-soft">
                {keys.length} chave(s) ativa(s) em {envLabel[env]} · {a.webhooks.filter((w) => w.environment === env).length} endereço(s) de aviso
              </p>
              <Button variant="outline" className="mt-auto self-start" onClick={() => setOpenId(a.id)}>Abrir</Button>
            </Card>
          );
        })}
      </div>

      <CreateApp open={creating} onClose={() => setCreating(false)} onCreated={(id) => { reload(); setCreating(false); setOpenId(id); }} />
      {open && <AppDrawer app={open} onClose={() => setOpenId(null)} onChange={reload} />}
    </>
  );
}

function CreateApp({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { base } = useOrg();
  const [name, setName] = useState("");
  const [display, setDisplay] = useState("");
  const act = useAction(async () => {
    const a = await post<Application>(`${base}/applications`, { name, display_name: display || name });
    setName("");
    setDisplay("");
    onCreated(a.id);
  });
  return (
    <Drawer open={open} onClose={onClose} title="Nova aplicação" description="Comece em Teste. Produção pode ser habilitada depois, dentro do limite do plano.">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act.run(); }}>
        <Field label="Nome interno" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} hint="Ex.: Loja virtual, App de entregas." />
        <Field label="Nome exibido ao usuário" minLength={2} maxLength={80} value={display} onChange={(e) => setDisplay(e.target.value)} hint="Aparece na página de verificação. Se ficar vazio, usamos o nome interno." />
        <FormError message={act.error} />
        <Button type="submit" size="lg" className="w-full" disabled={act.busy}>Criar aplicação</Button>
      </form>
    </Drawer>
  );
}

type Tab = "keys" | "data" | "integration" | "test";
const TABS: { id: Tab; label: string }[] = [
  { id: "keys", label: "Chaves" },
  { id: "integration", label: "Integração" },
  { id: "test", label: "Testar" },
  { id: "data", label: "Dados" },
];

function AppDrawer({ app, onClose, onChange }: { app: Application; onClose: () => void; onChange: () => void }) {
  const [tab, setTab] = useState<Tab>("keys");
  return (
    <Drawer open onClose={onClose} title={app.name}>
      <div role="tablist" aria-label="Seções da aplicação" className="flex flex-wrap gap-1 rounded-xl bg-mineral p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-semibold", tab === t.id ? "bg-white shadow-sm" : "text-petroleo-soft")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="space-y-5">
        {tab === "keys" && <KeysTab app={app} onChange={onChange} />}
        {tab === "data" && <DataTab app={app} onChange={onChange} onArchived={onClose} />}
        {tab === "integration" && <IntegrationTab />}
        {tab === "test" && <TestTab app={app} />}
      </div>
    </Drawer>
  );
}

function KeysTab({ app, onChange }: { app: Application; onChange: () => void }) {
  const { base, canEdit, env } = useOrg();
  const [secret, setSecret] = useState<string | null>(null);
  const keys = app.keys.filter((k) => k.environment === env);
  const active = keys.filter((k) => !k.revoked_at);

  const create = useAction(async () => {
    const k = await post<ApiKey & { secret: string }>(`${base}/applications/${app.id}/keys`, { environment: env, name: `Chave ${envLabel[env].toLowerCase()}` });
    setSecret(k.secret);
    onChange();
  });
  const rotate = useAction(async (id: string) => {
    if (!confirm("A chave atual para de funcionar imediatamente. Continuar?")) return;
    const k = await post<ApiKey & { secret: string }>(`${base}/keys/${id}/rotate`);
    setSecret(k.secret);
    onChange();
  });
  const revoke = useAction(async (id: string) => {
    if (!confirm("Revogar a chave? Integrações que usam esta chave param na hora.")) return;
    await post(`${base}/keys/${id}/revoke`);
    onChange();
  });
  const live = useAction(async (enabled: boolean) => {
    if (!enabled && !confirm("Desabilitar produção? Novas verificações de produção desta aplicação serão recusadas.")) return;
    await post(`${base}/applications/${app.id}/live`, { enabled });
    onChange();
  });

  return (
    <>
      <p className="text-petroleo-soft">
        Ambiente selecionado: <strong className="text-petroleo">{envLabel[env]}</strong>. Troque no seletor do topo da página.
      </p>

      {env === "live" && (
        <Card className="space-y-3">
          <h3 className="font-bold">Produção</h3>
          {app.live_enabled ? (
            <>
              <p className="text-[15px]">Habilitada. Esta aplicação conta para o limite de aplicações em produção do plano.</p>
              {canEdit && <Button variant="outline" size="sm" disabled={live.busy} onClick={() => live.run(false)}>Desabilitar produção</Button>}
            </>
          ) : (
            <>
              <p className="text-[15px]">Ainda não habilitada. É preciso e-mail confirmado e espaço no plano.</p>
              {canEdit && <Button size="sm" disabled={live.busy} onClick={() => live.run(true)}>Habilitar produção</Button>}
            </>
          )}
          <FormError message={live.error} />
        </Card>
      )}

      {secret && <SecretOnce value={secret} name="a chave secreta" />}
      <FormError message={create.error ?? rotate.error ?? revoke.error} />

      {active.length === 0 && !secret && <p>Nenhuma chave ativa em {envLabel[env]}.</p>}
      <ul className="space-y-3">
        {keys.map((k) => (
          <li key={k.id} className={cn("space-y-2 rounded-xl border border-linha p-4", k.revoked_at && "opacity-60")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <code className="font-mono text-sm">{k.prefix}…</code>
              {k.revoked_at ? <StatusBadge tone="off">Revogada</StatusBadge> : <StatusBadge tone="ok">Ativa</StatusBadge>}
            </div>
            <p className="text-sm text-petroleo-soft">Criada em {dateTime(k.created_at)} · último uso {relative(k.last_used_at)}</p>
            {canEdit && !k.revoked_at && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => rotate.run(k.id)}><RotateCw aria-hidden /> Trocar chave</Button>
                <Button size="sm" variant="ghost" onClick={() => revoke.run(k.id)}><Trash2 aria-hidden /> Revogar</Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (env === "test" || app.live_enabled) && (
        <Button disabled={create.busy} onClick={() => create.run()}><KeyRound aria-hidden /> Gerar chave de {envLabel[env].toLowerCase()}</Button>
      )}
      <p className="text-sm text-petroleo-soft">A chave secreta deve ficar apenas no servidor. Nunca coloque no navegador ou no app do celular.</p>
    </>
  );
}

function DataTab({ app, onChange, onArchived }: { app: Application; onChange: () => void; onArchived: () => void }) {
  const { base, canEdit } = useOrg();
  const [name, setName] = useState(app.name);
  const [display, setDisplay] = useState(app.display_name);
  const [urls, setUrls] = useState(app.allowed_redirect_urls.join("\n"));
  const [saved, setSaved] = useState(false);

  const save = useAction(async () => {
    setSaved(false);
    await patch(`${base}/applications/${app.id}`, {
      name,
      display_name: display,
      allowed_redirect_urls: urls.split("\n").map((u) => u.trim()).filter(Boolean),
    });
    setSaved(true);
    onChange();
  });
  const archive = useAction(async () => {
    if (!confirm("Arquivar a aplicação? Todas as chaves dela serão revogadas e a produção será desabilitada.")) return;
    await post(`${base}/applications/${app.id}/archive`);
    onChange();
    onArchived();
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.run(); }}>
      <fieldset disabled={!canEdit} className="space-y-4">
        <Field label="Nome interno" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Nome exibido ao usuário" required minLength={2} maxLength={80} value={display} onChange={(e) => setDisplay(e.target.value)} />
        <div className="space-y-1.5">
          <label htmlFor="redirects" className="block text-sm font-semibold">Endereços de retorno permitidos</label>
          <textarea
            id="redirects"
            rows={4}
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder="https://seusite.com.br/cadastro/concluido"
            className="w-full rounded-xl border border-linha bg-white px-4 py-3 font-mono text-sm"
            aria-describedby="redirects-hint"
          />
          <p id="redirects-hint" className="text-sm text-petroleo-soft">Um por linha, com HTTPS. Depois de confirmar, o usuário só é levado para endereços desta lista.</p>
        </div>
      </fieldset>
      <FormError message={save.error ?? archive.error} />
      {saved && <Notice tone="success"><p>Alterações salvas.</p></Notice>}
      {canEdit && (
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="submit" disabled={save.busy}>Salvar</Button>
          <Button type="button" variant="ghost" disabled={archive.busy} onClick={() => archive.run()}>Arquivar aplicação</Button>
        </div>
      )}
    </form>
  );
}

function IntegrationTab() {
  const apiBase = `${window.location.origin}/api`;
  const [lang, setLang] = useState<"node" | "php" | "curl">("node");
  const create = {
    node: `// Servidor Node.js 18+. A chave fica em variável de ambiente.
const res = await fetch("${apiBase}/v1/verifications", {
  method: "POST",
  headers: {
    authorization: \`Bearer \${process.env.SIMVIO_SECRET_KEY}\`,
    "content-type": "application/json",
    "idempotency-key": \`cadastro-\${usuario.id}-1\`,
  },
  body: JSON.stringify({
    phone_number: "+5511987654321",
    reference: usuario.id,
    purpose: "signup",
  }),
});
const verificacao = await res.json();
// Envie o usuário para verificacao.verification_url`,
    php: `// Laravel (HTTP Client). A chave fica no .env do servidor.
use Illuminate\\Support\\Facades\\Http;

$verificacao = Http::withToken(config('services.simvio.secret'))
    ->withHeaders(['Idempotency-Key' => "cadastro-{$usuario->id}-1"])
    ->post('${apiBase}/v1/verifications', [
        'phone_number' => '+5511987654321',
        'reference' => (string) $usuario->id,
        'purpose' => 'signup',
    ])->throw()->json();

return redirect()->away($verificacao['verification_url']);`,
    curl: `curl -X POST "${apiBase}/v1/verifications" \\
  -H "Authorization: Bearer $SIMVIO_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: cadastro-123-1" \\
  -d '{"phone_number":"+5511987654321","reference":"123","purpose":"signup"}'`,
  }[lang];

  return (
    <>
      <ol className="list-decimal space-y-2 pl-5 text-[15px]">
        <li>Seu servidor cria a verificação com a chave secreta.</li>
        <li>Leve o usuário para <code className="font-mono text-sm">verification_url</code>. Ele envia o SMS do próprio celular.</li>
        <li>Receba o aviso automático assinado ou consulte <code className="font-mono text-sm">GET /v1/verifications/:id</code>. Só confie no status confirmado pela API.</li>
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Endereço da API</span>
        <span className="flex items-center gap-2"><code className="font-mono text-sm">{apiBase}</code><CopyButton value={apiBase} /></span>
      </div>
      <div role="group" aria-label="Linguagem" className="flex gap-1 rounded-xl bg-mineral p-1">
        {(["node", "php", "curl"] as const).map((l) => (
          <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)} className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-semibold", lang === l ? "bg-white shadow-sm" : "text-petroleo-soft")}>
            {{ node: "Node.js", php: "PHP / Laravel", curl: "cURL" }[l]}
          </button>
        ))}
      </div>
      <CodeBlock code={create} />
      <p className="text-sm text-petroleo-soft">
        Exemplos completos, com validação da assinatura dos avisos, estão na <a href="/documentacao" className="font-semibold underline">documentação</a>.
      </p>
    </>
  );
}

function TestTab({ app }: { app: Application }) {
  const { base, canEdit } = useOrg();
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<CreatedVerification | null>(null);
  const act = useAction(async () => {
    setResult(await post<CreatedVerification>(`${base}/applications/${app.id}/test-verification`, { phone_number: phone }));
  });

  if (!canEdit) return <p>Somente quem desenvolve ou administra pode criar testes.</p>;

  return (
    <>
      <p className="text-[15px]">
        Cria uma verificação real no ambiente de Teste. Você mesmo envia o SMS do celular informado; a Simvio não envia mensagens.
      </p>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act.run(); }}>
        <Field label="Celular que vai enviar o SMS" type="tel" inputMode="tel" autoComplete="tel" required placeholder="+55 11 98765-4321" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <FormError message={act.error} />
        <Button type="submit" disabled={act.busy}>Criar verificação de teste</Button>
      </form>
      {result && (
        <Card className="space-y-3 border-lima">
          <p className="font-semibold">Verificação criada para {result.phone_masked}.</p>
          <p className="text-[15px]">Abra a página no celular informado e siga as instruções. O resultado aparece em Verificações.</p>
          {result.verification_url && (
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm"><a href={result.verification_url} target="_blank" rel="noreferrer">Abrir página de verificação <ExternalLink aria-hidden /></a></Button>
              <CopyButton value={result.verification_url} label="Copiar link" />
            </div>
          )}
          <p className="text-sm text-petroleo-soft">Expira em {dateTime(result.expires_at)}.</p>
        </Card>
      )}
    </>
  );
}
