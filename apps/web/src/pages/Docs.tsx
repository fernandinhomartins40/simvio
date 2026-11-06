import { Link } from "react-router";
import { BigTitle, Logo } from "@/components/brand";
import { CodeBlock } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";

const STATUS = [
  ["pending", "Aguardando o SMS do usuário."],
  ["verified", "SMS válido recebido do número informado, dentro do prazo. Único estado que confirma o número."],
  ["expired", "O prazo acabou sem SMS válido."],
  ["cancelled", "Cancelada pelo seu servidor ou substituída por outra verificação da mesma referência."],
  ["failed", "O aparelho receptor foi revogado ou trocou de número durante a verificação."],
];

const ERRORS = [
  ["400 invalid", "Dados inválidos (ex.: número fora do formato +55 celular)."],
  ["401 unauthorized", "Chave ausente, errada ou revogada."],
  ["402 plan_limit", "Limite do plano atingido."],
  ["403 forbidden / suspended", "Ação não permitida ou assinatura suspensa."],
  ["404 not_found", "Recurso inexistente ou de outra aplicação."],
  ["409 conflict", "Mesma Idempotency-Key com dados diferentes."],
  ["429 rate_limited", "Muitas tentativas. Aguarde e tente de novo."],
  ["503 receiver_unavailable", "Nenhum aparelho receptor disponível. Confira o painel."],
];

export default function Docs() {
  const api = `${window.location.origin}/api`;
  return (
    <div className="min-h-dvh bg-mineral">
      <header className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Link to="/" aria-label="Simvio, início"><Logo className="h-10" /></Link>
        <Button asChild variant="outline"><Link to="/entrar">Entrar</Link></Button>
      </header>
      <main className="mx-auto max-w-4xl space-y-10 px-4 pb-16 sm:px-8">
        <div className="space-y-3">
          <BigTitle>Documentação da API</BigTitle>
          <p className="text-lg text-petroleo-soft">
            Endereço base: <code className="font-mono text-base">{api}</code>. Todas as rotas usam JSON e a chave secreta da aplicação no cabeçalho <code className="font-mono text-base">Authorization: Bearer</code>.
          </p>
        </div>

        <Notice tone="warn"><p>A chave secreta (<code className="font-mono">sk_test_…</code> ou <code className="font-mono">sk_live_…</code>) só pode ser usada no seu servidor. Nunca no navegador nem em apps móveis.</p></Notice>

        <section className="space-y-4">
          <h2 className="text-2xl font-extrabold">1. Criar verificação</h2>
          <p><code className="font-mono">POST /v1/verifications</code> com o cabeçalho obrigatório <code className="font-mono">Idempotency-Key</code>. Repetir a chamada com a mesma chave e os mesmos dados devolve a mesma verificação.</p>
          <CodeBlock
            code={`curl -X POST "${api}/v1/verifications" \\
  -H "Authorization: Bearer $SIMVIO_SECRET_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: cadastro-123-1" \\
  -d '{
    "phone_number": "+5511987654321",
    "reference": "123",
    "purpose": "signup",
    "redirect_url": "https://seusite.com.br/cadastro/concluido"
  }'`}
          />
          <ul className="list-disc space-y-1 pl-5 text-[15px]">
            <li><strong>phone_number</strong>: celular brasileiro em E.164.</li>
            <li><strong>reference</strong>: identificador do seu lado (ex.: id do cadastro). Uma nova verificação da mesma referência cancela a anterior.</li>
            <li><strong>purpose</strong>: <code className="font-mono">signup</code> ou <code className="font-mono">verification</code>.</li>
            <li><strong>redirect_url</strong> (opcional): precisa estar na lista de endereços de retorno da aplicação.</li>
          </ul>
          <p>A resposta traz <code className="font-mono">id</code>, <code className="font-mono">status</code>, <code className="font-mono">expires_at</code>, <code className="font-mono">receiver_number</code>, <code className="font-mono">message_body</code> e <code className="font-mono">verification_url</code>. Leve o usuário para <code className="font-mono">verification_url</code>: a página mostra o número de destino e a mensagem, e abre o app de mensagens dele.</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-extrabold">2. Consultar ou cancelar</h2>
          <CodeBlock code={`GET  /v1/verifications/{id}\nPOST /v1/verifications/{id}/cancel`} />
          <Card className="p-0">
            <dl className="divide-y divide-linha">
              {STATUS.map(([s, d]) => (
                <div key={s} className="grid gap-1 p-4 sm:grid-cols-[8rem_1fr]">
                  <dt className="font-mono font-semibold">{s}</dt>
                  <dd className="text-petroleo-soft">{d}</dd>
                </div>
              ))}
            </dl>
          </Card>
          <p className="text-[15px]">Antes de liberar o cadastro, confira na API que o status é <code className="font-mono">verified</code> e que a referência e o número são os esperados.</p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-extrabold">3. Avisos automáticos (webhooks)</h2>
          <p>Cadastre a URL HTTPS do seu servidor em Avisos automáticos. Eventos: <code className="font-mono">verification.verified</code>, <code className="font-mono">verification.expired</code>, <code className="font-mono">verification.cancelled</code>, <code className="font-mono">verification.failed</code>.</p>
          <p>Cada aviso traz os cabeçalhos <code className="font-mono">Simvio-Event-Id</code>, <code className="font-mono">Simvio-Timestamp</code>, <code className="font-mono">Simvio-Event-Type</code> e <code className="font-mono">Simvio-Signature: v1=&lt;hex&gt;</code>. A assinatura é HMAC-SHA256 com o segredo do endereço sobre <code className="font-mono">{"{timestamp}.{event_id}.{corpo bruto}"}</code>.</p>
          <CodeBlock
            code={`import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyWebhook(rawBody, headers, secret) {
  const eventId = headers["simvio-event-id"];
  const ts = Number(headers["simvio-timestamp"]);
  const sig = String(headers["simvio-signature"] ?? "");
  if (!eventId || !sig.startsWith("v1=")) throw new Error("sem assinatura");
  if (Math.abs(Date.now() / 1000 - ts) > 300) throw new Error("aviso antigo");
  const expected = createHmac("sha256", secret).update(\`\${ts}.\${eventId}.\${rawBody}\`).digest();
  const got = Buffer.from(sig.slice(3), "hex");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) throw new Error("assinatura inválida");
  return JSON.parse(rawBody);
}`}
          />
          <ul className="list-disc space-y-1 pl-5 text-[15px]">
            <li>Responda 2xx em até 10 segundos. Outras respostas são tentadas de novo por algumas horas.</li>
            <li>O mesmo aviso pode chegar mais de uma vez: ignore <code className="font-mono">event_id</code> já processado.</li>
            <li>Redirecionamentos não são seguidos e endereços internos são recusados.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-extrabold">Erros</h2>
          <p>Formato: <code className="font-mono">{`{ "error": { "code": "...", "message": "..." } }`}</code></p>
          <Card className="p-0">
            <dl className="divide-y divide-linha">
              {ERRORS.map(([c, d]) => (
                <div key={c} className="grid gap-1 p-4 sm:grid-cols-[14rem_1fr]">
                  <dt className="font-mono font-semibold">{c}</dt>
                  <dd className="text-petroleo-soft">{d}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </section>

        <p className="text-[15px]">
          Exemplos completos em Node.js e PHP/Laravel acompanham o código-fonte do projeto (<code className="font-mono">examples/</code>). A especificação OpenAPI fica em <code className="font-mono">docs/openapi.yaml</code>.
        </p>
      </main>
    </div>
  );
}
