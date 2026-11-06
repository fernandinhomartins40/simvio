#!/usr/bin/env node
// Conferência de uma instalação do Simvio por uma única URL (só pelo Nginx). Node 22, sem dependências.
//
//   node scripts/smoke.mjs https://simvio.seudominio.com.br          # básico: não cria nada
//   SIMVIO_API_KEY=sk_test_... SIMVIO_PAIRING_CODE=XXXX-XXXX-XXXX \
//     node scripts/smoke.mjs http://127.0.0.1:8080 --full              # fluxo completo com aparelho simulado
//
// --full é para ambiente de teste: cria um aparelho simulado (consome o código de pareamento) e uma
// verificação de teste. Opcional: SMOKE_WEBHOOK_PORT + SMOKE_WEBHOOK_SECRET sobem um receptor local
// e conferem a assinatura do aviso verification.verified (o endpoint precisa estar cadastrado
// apontando para esse receptor). Segredos nunca são impressos.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const args = process.argv.slice(2);
const full = args.includes("--full");
const base = (args.find((a) => !a.startsWith("--")) ?? process.env.SIMVIO_URL ?? "").replace(/\/+$/, "");
if (!base) {
  console.error("Uso: node scripts/smoke.mjs <url-base> [--full]  (ou SIMVIO_URL)");
  process.exit(2);
}
const api = `${base}/api/v1`;

let failures = 0;
function check(ok, label, detail = "") {
  console.log(`${ok ? "OK  " : "FALHA"} ${label}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
  return ok;
}

async function req(method, url, { auth, body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    redirect: "manual",
    headers: {
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, headers: res.headers, text, json };
}

const tokenOf = (message) => /^SIMVIO\s+([A-Za-z2-7]{26})$/.exec(message?.trim() ?? "")?.[1];
// Celular brasileiro aleatório para não esbarrar no limite por número.
const randomPhone = () => `+55119${String(randomInt(10_000_000, 99_999_999))}`;
const nationalFormat = (e164) => `0${e164.slice(3)}`; // como algumas operadoras entregam o remetente
const errOf = (r) => `HTTP ${r.status} ${r.json?.error?.code ?? ""}`.trim();

async function basic() {
  let r = await req("GET", `${api.replace("/v1", "")}/healthz`);
  check(r.status === 200 && r.json?.status === "ok", "API viva (/api/healthz)", errOf(r));
  r = await req("GET", `${api.replace("/v1", "")}/readyz`);
  check(r.status === 200 && r.json?.status === "ready", "API com banco (/api/readyz)", errOf(r));

  for (const path of ["/", "/v/x", "/app"]) {
    r = await req("GET", `${base}${path}`);
    check(r.status === 200 && r.text.includes('id="root"'), `painel servido em ${path}`, `HTTP ${r.status}`);
  }
  r = await req("GET", `${base}/`);
  const h = r.headers;
  check(h.get("x-content-type-options") === "nosniff", "cabeçalho X-Content-Type-Options");
  check(/frame-ancestors 'none'/.test(h.get("content-security-policy") ?? "") || h.get("x-frame-options") === "DENY", "proteção contra iframe (CSP/X-Frame-Options)");
  check(!!h.get("content-security-policy"), "cabeçalho Content-Security-Policy");
  r = await req("GET", `${base}/v/x`);
  check(r.headers.get("referrer-policy") === "no-referrer", "página /v/ com Referrer-Policy no-referrer");
  check((r.headers.get("cache-control") ?? "").includes("no-store"), "página /v/ sem cache");

  r = await req("GET", `${api}/auth/me`);
  check(r.status === 401, "/api/v1/auth/me exige sessão (401)", `HTTP ${r.status}`);
  r = await req("GET", `${api}/verifications/x`);
  check(r.status === 401, "API de integração exige chave (401)", `HTTP ${r.status}`);
  r = await req("GET", `${api}/public/sessions/${"A".repeat(43)}`);
  check(r.status === 404, "sessão pública inexistente responde 404", `HTTP ${r.status}`);
}

function startWebhookReceiver(port, secret) {
  let resolveEvent;
  const got = new Promise((r) => (resolveEvent = r));
  const server = createServer((rq, rs) => {
    let raw = "";
    rq.on("data", (c) => (raw += c));
    rq.on("end", () => {
      const ts = rq.headers["simvio-timestamp"];
      const id = rq.headers["simvio-event-id"];
      const sig = String(rq.headers["simvio-signature"] ?? "").replace(/^v1=/, "");
      const expected = createHmac("sha256", secret).update(`${ts}.${id}.${raw}`).digest("hex");
      const valid = sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      rs.writeHead(valid ? 200 : 401).end();
      let payload = null;
      try {
        payload = JSON.parse(raw);
      } catch {}
      resolveEvent({ valid, type: rq.headers["simvio-event-type"], payload, ts: Number(ts) });
    });
  });
  server.listen(port, "0.0.0.0");
  return { got, close: () => server.close() };
}

async function fullFlow() {
  const key = process.env.SIMVIO_API_KEY;
  const code = process.env.SIMVIO_PAIRING_CODE;
  if (!check(!!key?.startsWith("sk_test_"), "SIMVIO_API_KEY é uma chave de teste (sk_test_)")) return;
  if (!check(!!code, "SIMVIO_PAIRING_CODE informado")) return;

  const hookPort = Number(process.env.SMOKE_WEBHOOK_PORT || 0);
  const hookSecret = process.env.SMOKE_WEBHOOK_SECRET;
  const hook = hookPort && hookSecret ? startWebhookReceiver(hookPort, hookSecret) : null;

  try {
    let r = await req("POST", `${api}/devices/pair`, { body: { code, name: "Smoke (simulado)", app_version: "smoke" } });
    if (!check(r.status === 201 && r.json?.device_credential?.startsWith("smv_dev_"), "pareamento do aparelho simulado", errOf(r))) return;
    const dev = r.json.device_credential;

    r = await req("POST", `${api}/devices/heartbeat`, { auth: dev, body: { app_version: "smoke", diagnostics: { receive_sms_permission: true, pending_events: 0 } } });
    check(r.status === 200, "sinal de vida do aparelho (heartbeat)", errOf(r));

    const receiver = randomPhone();
    r = await req("POST", `${api}/devices/line`, { auth: dev, body: { phone_number: receiver } });
    const lineToken = tokenOf(r.json?.message_body);
    if (!check(r.status === 200 && !!lineToken, "cadastro do número do receptor", errOf(r))) return;

    r = await req("POST", `${api}/device-events`, { auth: dev, body: { event_id: `smoke-line-${randomBytes(6).toString("hex")}`, sender: randomPhone(), token: lineToken, subscription_id: 1 } });
    if (!check(r.json?.outcome === "line_verified", "SMS de teste da linha confirmou o número", r.json?.outcome ?? errOf(r))) return;

    const user = randomPhone();
    r = await req("POST", `${api}/verifications`, {
      auth: key,
      headers: { "idempotency-key": `smoke-${randomBytes(8).toString("hex")}` },
      body: { phone_number: user, reference: `smoke-${Date.now()}` },
    });
    const v = r.json;
    const token = tokenOf(v?.message_body);
    if (!check(r.status === 201 && v?.status === "pending" && !!token, "criação da verificação (pendente)", errOf(r))) return;
    check(v.receiver_number === receiver, "verificação aponta para o número do receptor");
    check(typeof v.verification_url === "string" && v.verification_url.includes("/v/"), "verificação traz a página pública");

    const publicToken = v.verification_url?.split("/v/")[1];
    if (publicToken) {
      r = await req("GET", `${api}/public/sessions/${publicToken}`);
      check(r.status === 200 && r.json?.status === "pending", "página pública consulta a sessão pelo Nginx", errOf(r));
    }

    r = await req("POST", `${api}/device-events`, { auth: dev, body: { event_id: `smoke-wrong-${randomBytes(6).toString("hex")}`, sender: randomPhone(), token, subscription_id: 1 } });
    check(r.json?.outcome === "rejected_sender", "SMS de outro número foi recusado", r.json?.outcome ?? errOf(r));

    const okEvent = `smoke-ok-${randomBytes(6).toString("hex")}`;
    r = await req("POST", `${api}/device-events`, { auth: dev, body: { event_id: okEvent, sender: nationalFormat(user), token, subscription_id: 1 } });
    check(r.json?.outcome === "verified", "SMS do número certo (formato nacional) verificou", r.json?.outcome ?? errOf(r));
    r = await req("POST", `${api}/device-events`, { auth: dev, body: { event_id: okEvent, sender: nationalFormat(user), token, subscription_id: 1 } });
    check(r.json?.duplicate === true && r.json?.outcome === "verified", "reenvio do mesmo evento é tratado como duplicado");

    r = await req("GET", `${api}/verifications/${v.id}`, { auth: key });
    check(r.json?.status === "verified" && !!r.json?.verified_at, "consulta pela API confirma 'verified'", r.json?.status ?? errOf(r));
    check(r.json?.message_body === null, "desafio não é mais exposto após a verificação");

    if (hook) {
      const ev = await Promise.race([hook.got, new Promise((res) => setTimeout(() => res(null), 60_000))]);
      if (check(!!ev, "aviso automático (webhook) chegou em até 60 s")) {
        check(ev.valid, "assinatura v1 do webhook confere");
        check(ev.type === "verification.verified" && ev.payload?.verification_id === v.id, "webhook é do evento e da verificação certos");
        check(Math.abs(Date.now() / 1000 - ev.ts) < 300, "carimbo de tempo do webhook dentro de 5 min");
      }
    } else {
      console.log("--   webhook não conferido (defina SMOKE_WEBHOOK_PORT e SMOKE_WEBHOOK_SECRET)");
    }

    r = await req("POST", `${api}/devices/unpair`, { auth: dev });
    check(r.json?.status === "revoked", "aparelho simulado desconectado (revogado)", errOf(r));
    r = await req("POST", `${api}/devices/heartbeat`, { auth: dev, body: {} });
    check(r.status === 401, "credencial revogada não funciona mais", `HTTP ${r.status}`);
  } finally {
    hook?.close();
  }
}

await basic();
if (full) await fullFlow();
console.log(failures ? `\n${failures} falha(s).` : "\nTudo certo.");
process.exit(failures ? 1 : 0);
