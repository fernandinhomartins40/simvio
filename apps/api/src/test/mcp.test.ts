import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { createAgentKey, revokeAgentKey } from "../modules/agentKeys.js";
import { createTenant, nextPhone, resetDb, type Tenant } from "./helpers.js";

let app: FastifyInstance;
let url: string;
let A: Tenant;
let B: Tenant;

beforeAll(async () => {
  app = await buildApp({ logger: false });
  const address = await app.listen({ host: "127.0.0.1", port: 0 }).then(() => app.server.address() as AddressInfo);
  url = `http://127.0.0.1:${address.port}/mcp`;
});
afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  A = await createTenant("A");
  B = await createTenant("B");
});

const newKey = async (orgId: string, allowLive = false, days: number | null = null) => (await createAgentKey(orgId, "agente", allowLive, days, "usuario")).secret;

/** Fala o protocolo de verdade: JSON-RPC por HTTP, como Cursor e VS Code. */
async function rpc(secret: string | null, method: string, params: object = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function call(secret: string, name: string, args: object = {}) {
  const res = await rpc(secret, "tools/call", { name, arguments: args });
  expect(res.status).toBe(200);
  const { result } = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
  return { isError: !!result.isError, text: result.content[0]!.text };
}

describe("MCP", () => {
  it("recusa sem chave, com chave revogada e com chave expirada", async () => {
    expect((await rpc(null, "tools/list")).status).toBe(401);
    expect((await rpc("smv_agent_invalida", "tools/list")).status).toBe(401);
    const secret = await newKey(A.orgId);
    expect((await rpc(secret, "tools/list")).status).toBe(200);
    const key = await prisma.agentKey.findFirstOrThrow({ where: { organizationId: A.orgId } });
    await revokeAgentKey(A.orgId, key.id, "usuario");
    expect((await rpc(secret, "tools/list")).status).toBe(401);
    const expiring = await newKey(A.orgId, false, 1);
    await prisma.agentKey.updateMany({ where: { organizationId: A.orgId, revokedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await rpc(expiring, "tools/list")).status).toBe(401);
  });

  it("guarda só o digest e registra o uso", async () => {
    const secret = await newKey(A.orgId);
    await rpc(secret, "tools/list");
    const key = await prisma.agentKey.findFirstOrThrow({ where: { organizationId: A.orgId } });
    expect(key.digest).not.toContain(secret);
    expect(key.lastUsedAt).not.toBeNull();
  });

  it("lista as ferramentas e não oferece nada de chave de agente, equipe, plano ou exclusão", async () => {
    const res = await rpc(await newKey(A.orgId), "tools/list");
    const { result } = (await res.json()) as { result: { tools: { name: string }[] } };
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("criar_chave_api");
    expect(names).toContain("buscar_documentacao");
    expect(names.filter((n) => /agente|equipe|membro|plano|assinatura|excluir|revogar_aparelho/.test(n))).toEqual([]);
  });

  it("não cria chave de agente pelo protocolo", async () => {
    const secret = await newKey(A.orgId);
    const res = await call(secret, "criar_chave_agente");
    expect(res.isError).toBe(true);
    expect(await prisma.agentKey.count({ where: { organizationId: A.orgId } })).toBe(1);
  });

  it("isola organizações", async () => {
    const secret = await newKey(A.orgId);
    const apps = await call(secret, "listar_aplicacoes");
    expect(apps.text).toContain(A.appId);
    expect(apps.text).not.toContain(B.appId);
    expect((await call(secret, "criar_chave_api", { application_id: B.appId, ambiente: "test" })).isError).toBe(true);
    const foreignKey = await prisma.apiKey.findFirstOrThrow({ where: { organizationId: B.orgId, environment: "test" } });
    expect((await call(secret, "revogar_chave_api", { key_id: foreignKey.id })).isError).toBe(true);
    expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: foreignKey.id } })).revokedAt).toBeNull();
  });

  it("produção exige a permissão da chave", async () => {
    const limited = await newKey(A.orgId);
    const live = await prisma.apiKey.findFirstOrThrow({ where: { organizationId: A.orgId, environment: "live" } });
    expect((await call(limited, "criar_chave_api", { application_id: A.appId, ambiente: "live" })).isError).toBe(true);
    expect((await call(limited, "revogar_chave_api", { key_id: live.id })).isError).toBe(true);
    expect((await call(limited, "definir_urls_de_retorno", { application_id: A.appId, urls: ["https://exemplo.test/fim"] })).isError).toBe(true);
    expect((await call(limited, "criar_aviso_automatico", { application_id: A.appId, ambiente: "live", url: "https://exemplo.test/aviso" })).isError).toBe(true);

    const full = await newKey(A.orgId, true);
    const created = await call(full, "criar_chave_api", { application_id: A.appId, ambiente: "live" });
    expect(created.isError).toBe(false);
    expect(created.text).toContain("sk_live_");
  });

  it("configura o ambiente de teste de ponta a ponta, com auditoria e telefone mascarado", async () => {
    const secret = await newKey(A.orgId);
    const created = JSON.parse((await call(secret, "criar_aplicacao", { name: "Loja", display_name: "Loja Teste" })).text) as { id: string };
    const key = await call(secret, "criar_chave_api", { application_id: created.id, ambiente: "test" });
    expect(key.text).toContain("sk_test_");
    const pairing = await call(secret, "gerar_codigo_de_pareamento");
    expect(pairing.isError).toBe(false);

    const phone = nextPhone();
    expect((await call(secret, "criar_verificacao_de_teste", { application_id: A.appId, phone_number: phone })).isError).toBe(false);
    const history = await call(secret, "consultar_verificacoes", { environment: "test" });
    expect(history.text).toContain(phone.slice(-4));
    expect(history.text).not.toContain(phone);

    const logs = await prisma.auditLog.findMany({ where: { organizationId: A.orgId, actorType: "agent_key" } });
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["application.created", "api_key.created", "device.pairing_created"]));
  });

  it("valida o endereço de aviso contra destinos internos e consulta a documentação", async () => {
    const secret = await newKey(A.orgId);
    config.WEBHOOK_ALLOW_PRIVATE_TARGETS = false;
    try {
      expect((await call(secret, "criar_aviso_automatico", { application_id: A.appId, ambiente: "test", url: "https://169.254.169.254/latest" })).isError).toBe(true);
    } finally {
      config.WEBHOOK_ALLOW_PRIVATE_TARGETS = true;
    }
    const docs = await call(secret, "buscar_documentacao", { consulta: "assinatura Simvio-Signature" });
    expect(docs.text).toContain("Simvio-Signature");
  });

  it("limita requisições por chave", async () => {
    const secret = await newKey(A.orgId);
    const other = await newKey(A.orgId);
    const res = await Promise.all(Array.from({ length: 125 }, () => rpc(secret, "tools/list")));
    expect(res.filter((r) => r.status === 429).length).toBeGreaterThan(0);
    expect((await rpc(other, "tools/list")).status).toBe(200);
  });

  it("funciona com o cliente oficial do protocolo, como os editores", async () => {
    const client = new Client({ name: "teste", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${await newKey(A.orgId)}` } } }));
    const { tools } = await client.listTools();
    expect(tools.some((t) => t.name === "ver_situacao")).toBe(true);
    const res = (await client.callTool({ name: "ver_situacao", arguments: {} })) as { content: { text: string }[] };
    expect(res.content[0]!.text).toContain("verified_total");
    await client.close();
  });

  it("GET não abre fluxo", async () => {
    expect((await fetch(url)).status).toBe(405);
  });
});
