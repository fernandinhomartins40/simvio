import { useState } from "react";
import { Bot } from "lucide-react";
import { CodeBlock, EmptyState, LoadError, Loading, PageHeader, SecretOnce, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import { Field, FormError } from "@/components/ui/form";
import { useOrg } from "@/layouts/AppShell";
import { useAction } from "@/lib/action";
import { dateTime, relative } from "@/lib/format";
import { post, useResource } from "@/lib/session";
import type { AgentKey } from "@/lib/types";

const MCP_URL = `${window.location.origin}/api/mcp`;

/** Links e arquivos de instalação no formato documentado por Cursor e VS Code. */
function Install({ secret }: { secret: string }) {
  const server = { url: MCP_URL, headers: { Authorization: `Bearer ${secret}` } };
  const cursor = `cursor://anysphere.cursor-deeplink/mcp/install?name=simvio&config=${encodeURIComponent(btoa(JSON.stringify(server)))}`;
  const vscode = `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "simvio", type: "http", ...server }))}`;
  return (
    <Card className="space-y-4">
      <h2 className="text-xl font-bold">Instale no seu editor</h2>
      <div className="flex flex-wrap gap-3">
        <Button asChild><a href={cursor}>Instalar no Cursor</a></Button>
        <Button asChild variant="outline"><a href={vscode}>Instalar no VS Code</a></Button>
      </div>
      <Notice tone="warn"><p>Esta chave dá acesso à sua organização. Se usar os arquivos abaixo, não envie esses arquivos para o Git: inclua os dois no <code>.gitignore</code>.</p></Notice>
      <p className="font-semibold">Ou copie para <code>.cursor/mcp.json</code></p>
      <CodeBlock code={JSON.stringify({ mcpServers: { simvio: server } }, null, 2)} />
      <p className="font-semibold">Ou copie para <code>.vscode/mcp.json</code></p>
      <CodeBlock code={JSON.stringify({ servers: { simvio: { type: "http", ...server } } }, null, 2)} />
      <p className="text-petroleo-soft">Depois de instalar, peça ao agente: “Configure a Simvio neste projeto”.</p>
    </Card>
  );
}

export default function AgentsPage() {
  const { base, canEdit } = useOrg();
  const { data, error, loading, reload } = useResource<AgentKey[]>(canEdit ? `${base}/agent-keys` : null);
  const [name, setName] = useState("");
  const [allowLive, setAllowLive] = useState(false);
  const [days, setDays] = useState("90");
  const [secret, setSecret] = useState<string | null>(null);

  const create = useAction(async () => {
    const key = await post<AgentKey & { secret: string }>(`${base}/agent-keys`, { name, allow_live: allowLive, expires_in_days: days ? Number(days) : null });
    setSecret(key.secret);
    setName("");
    setAllowLive(false);
    reload();
  });
  const revoke = useAction(async (id: string, keyName: string) => {
    if (!confirm(`Revogar a chave “${keyName}”? O agente perde o acesso na hora.`)) return;
    await post(`${base}/agent-keys/${id}/revoke`);
    reload();
  });

  if (!canEdit) {
    return (
      <>
        <PageHeader title="Agentes de IA" />
        <Notice tone="info"><p>Seu papel é de visualização. Peça a quem administra a organização para gerar a chave.</p></Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Agentes de IA" description="Conecte o Cursor ou o VS Code para o agente de IA configurar a Simvio e consultar a documentação." />

      {secret && (
        <>
          <SecretOnce value={secret} name="a chave do agente" />
          <Install secret={secret} />
        </>
      )}

      <Card className="space-y-4 lg:max-w-xl">
        <h2 className="text-xl font-bold">Gerar chave</h2>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setSecret(null); create.run(); }}>
          <Field label="Nome" required maxLength={80} placeholder="Cursor do meu computador" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label="Validade em dias" type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} hint="Deixe vazio para não expirar." />
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1 size-5" checked={allowLive} onChange={(e) => setAllowLive(e.target.checked)} />
            <span>
              <span className="block font-semibold">Permitir alterar produção</span>
              <span className="block text-sm text-petroleo-soft">Desligado, o agente só altera o ambiente de teste.</span>
            </span>
          </label>
          <FormError message={create.error} />
          <Button type="submit" disabled={create.busy}>Gerar chave</Button>
        </form>
      </Card>

      {loading && !data && <Loading />}
      {error && !data && <LoadError error={error} onRetry={reload} />}
      <FormError message={revoke.error} />
      {data && data.length === 0 && <EmptyState icon={Bot} title="Nenhuma chave de agente" text="Gere uma chave para conectar seu editor." />}
      {data && data.length > 0 && (
        <Card className="p-0">
          <ul className="divide-y divide-linha">
            {data.map((k) => {
              const expired = !!k.expires_at && Date.parse(k.expires_at) <= Date.now();
              return (
                <li key={k.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">{k.name}</p>
                    <p className="text-sm text-petroleo-soft">
                      <code>{k.prefix}…</code> · {k.allow_live ? "teste e produção" : "só teste"} · último uso {relative(k.last_used_at)}{k.expires_at && ` · vale até ${dateTime(k.expires_at)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {k.revoked_at ? <StatusBadge tone="off">Revogada</StatusBadge> : expired ? <StatusBadge tone="off">Expirada</StatusBadge> : <StatusBadge tone="ok">Ativa</StatusBadge>}
                    {!k.revoked_at && <Button size="sm" variant="ghost" onClick={() => revoke.run(k.id, k.name)}>Revogar</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
