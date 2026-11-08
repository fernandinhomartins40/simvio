import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ENVIRONMENTS } from "@simvio/contracts";
import { prisma } from "../db.js";
import { type Actor } from "../lib/audit.js";
import { sha256 } from "../lib/crypto.js";
import { ApiError, forbidden, notFound } from "../lib/errors.js";
import { authenticateAgentKey } from "../modules/agentKeys.js";
import { revokeApiKey } from "../modules/apikeys.js";
import { createPairing } from "../modules/devices/service.js";
import {
  appBody,
  createApplication,
  createAppKey,
  createTestVerification,
  createWebhook,
  findApp,
  listApplications,
  listDeliveries,
  listDevices,
  listVerifications,
  orgOverview,
  redeliverWebhook,
  redirectUrl,
  updateApplication,
  verificationFilter,
} from "./panel.js";

// Mesma profundidade a partir de src/routes e de dist/routes; na imagem fica em /app/docs.
const DOCS = ["openapi.yaml", "guia-agente.md"].flatMap((file) => {
  const text = readFileSync(new URL(`../../../../docs/${file}`, import.meta.url), "utf8");
  const parts = text.split(file.endsWith(".md") ? /^(?=#{1,3} )/m : /^(?= {0,2}[^\s#-][^:\n]*:)/m);
  return parts.map((part) => ({ file, part: part.trim() })).filter((d) => d.part);
});

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

function searchDocs(query: string) {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  return DOCS.map((d) => {
    const hay = fold(d.part);
    return { ...d, score: terms.filter((t) => hay.includes(t)).length };
  })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((d) => `[${d.file}]\n${d.part.slice(0, 2000)}`)
    .join("\n\n---\n\n");
}

type Agent = Awaited<ReturnType<typeof authenticateAgentKey>>;

const environment = z.enum(ENVIRONMENTS);

function assertAllowed(agent: Agent, env: string) {
  if (env === "live" && !agent.allowLive) throw forbidden("Esta chave de agente só pode alterar o ambiente de teste. Gere no painel uma chave com permissão de produção.");
}

/** Um servidor por requisição: sem estado, e cada chamada só enxerga a organização da chave. */
function buildServer(agent: Agent) {
  const server = new McpServer({ name: "simvio", version: "1.0.0" });
  const orgId = agent.organizationId;
  const actor: Actor = { type: "agent_key", id: agent.id };

  const tool = <S extends z.ZodRawShape>(name: string, description: string, inputSchema: S, run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>) =>
    server.registerTool(name, { description, inputSchema }, (async (args: z.infer<z.ZodObject<S>>) => {
      try {
        const result = await run(args);
        return { content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result ?? { status: "ok" }, null, 2) }] };
      } catch (err) {
        // Só erros de regra chegam ao agente; o restante vira mensagem genérica, sem detalhes internos.
        if (err instanceof ApiError) return { isError: true, content: [{ type: "text", text: err.message }] };
        console.error("erro em ferramenta MCP", name, err instanceof Error ? err.name : "desconhecido");
        return { isError: true, content: [{ type: "text", text: "Erro interno. Tente novamente." }] };
      }
    }) as never);

  tool("buscar_documentacao", "Busca na documentação da Simvio: integração, erros, avisos automáticos e assinatura.", { consulta: z.string().trim().min(2).max(200) }, async ({ consulta }) =>
    searchDocs(consulta) || "Nada encontrado. Tente outras palavras.",
  );

  tool("ver_situacao", "Mostra se a organização está pronta para verificar: passos concluídos, aparelhos com problema e falhas recentes.", {}, () => orgOverview(orgId));

  tool("listar_aplicacoes", "Lista as aplicações, suas chaves (sem o segredo) e seus endereços de aviso.", {}, () => listApplications(orgId));

  tool("criar_aplicacao", "Cria uma aplicação (o site ou app que vai verificar números).", appBody.shape, (args) => createApplication(orgId, args, actor));

  tool(
    "definir_urls_de_retorno",
    "Define os endereços para onde o usuário pode voltar depois de verificar. Substitui a lista atual.",
    { application_id: z.string().max(64), urls: z.array(redirectUrl).max(20) },
    async ({ application_id, urls }) => {
      const target = await findApp(orgId, application_id);
      if (target.liveEnabled) assertAllowed(agent, "live");
      return updateApplication(orgId, application_id, { allowed_redirect_urls: urls }, actor);
    },
  );

  tool(
    "criar_chave_api",
    "Cria uma chave secreta para o servidor da aplicação. O segredo aparece só nesta resposta: guarde em variável de ambiente, nunca no código.",
    { application_id: z.string().max(64), ambiente: environment, nome: z.string().trim().min(1).max(80).default("Chave do agente") },
    async ({ application_id, ambiente, nome }) => {
      assertAllowed(agent, ambiente);
      return createAppKey(orgId, application_id, ambiente, nome, actor);
    },
  );

  tool("revogar_chave_api", "Revoga uma chave secreta da aplicação. Ela para de funcionar na hora.", { key_id: z.string().max(64) }, async ({ key_id }) => {
    const key = await prisma.apiKey.findFirst({ where: { id: key_id, organizationId: orgId } });
    if (!key) throw notFound("Chave");
    assertAllowed(agent, key.environment);
    await revokeApiKey(orgId, key.id, agent.id, "agent_key");
  });

  tool(
    "criar_aviso_automatico",
    "Cadastra o endereço HTTPS que recebe os avisos automáticos (webhooks) assinados. O segredo de assinatura aparece só nesta resposta.",
    { application_id: z.string().max(64), ambiente: environment, url: z.url().max(2000) },
    async ({ application_id, ambiente, url }) => {
      assertAllowed(agent, ambiente);
      return createWebhook(orgId, application_id, ambiente, url, actor);
    },
  );

  tool(
    "listar_entregas_de_avisos",
    "Lista as últimas entregas de avisos automáticos com as tentativas e os erros, para diagnosticar o endereço de aviso.",
    { status: z.enum(["pending", "succeeded", "failed"]).optional(), ambiente: environment.optional() },
    ({ status, ambiente }) => listDeliveries(orgId, { status, environment: ambiente }),
  );

  tool("reenviar_aviso", "Envia de novo um aviso automático já gerado, para testar o endereço de aviso.", { delivery_id: z.string().max(64) }, async ({ delivery_id }) => {
    const delivery = await prisma.webhookDelivery.findFirst({ where: { id: delivery_id, organizationId: orgId }, include: { outboxEvent: { select: { environment: true } } } });
    if (!delivery) throw notFound("Entrega");
    assertAllowed(agent, delivery.outboxEvent.environment);
    await redeliverWebhook(orgId, delivery_id, actor);
  });

  tool("gerar_codigo_de_pareamento", "Gera o código que conecta um Android com o app Simvio. Vale por poucos minutos e uma única vez.", {}, () => createPairing(orgId, agent.id, "agent_key"));

  tool("listar_aparelhos", "Lista os aparelhos receptores, a situação de cada um e o diagnóstico.", {}, () => listDevices(orgId));

  tool(
    "criar_verificacao_de_teste",
    "Cria uma verificação no ambiente de teste. Quem envia o SMS é o dono do número informado.",
    { application_id: z.string().max(64), phone_number: z.string().min(8).max(25) },
    ({ application_id, phone_number }) => createTestVerification(orgId, application_id, phone_number),
  );

  tool("consultar_verificacoes", "Consulta o histórico de verificações, com o telefone mascarado.", verificationFilter.shape, (args) => listVerifications(orgId, args));

  return server;
}

export async function mcpRoutes(app: FastifyInstance) {
  app.post(
    "/mcp",
    {
      config: {
        // Por chave, e não por IP: várias máquinas podem usar a mesma chave. O digest evita guardar o segredo.
        rateLimit: { max: 120, timeWindow: "1 minute", keyGenerator: (req: { headers: { authorization?: string }; ip: string }) => (req.headers.authorization ? sha256(req.headers.authorization) : req.ip) },
      },
    },
    async (req, reply) => {
      const agent = await authenticateAgentKey(req.headers.authorization);
      const server = buildServer(agent);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      reply.hijack();
      reply.raw.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport as never);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    },
  );

  // Sem estado: não há fluxo de eventos nem sessão para abrir ou encerrar.
  const notAllowed = { error: { code: "method_not_allowed", message: "Use POST." } };
  app.get("/mcp", async (_req, reply) => reply.code(405).header("allow", "POST").send(notAllowed));
  app.delete("/mcp", async (_req, reply) => reply.code(405).header("allow", "POST").send(notAllowed));
}
