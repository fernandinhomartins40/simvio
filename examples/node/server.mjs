// Exemplo completo de backend integrado à Simvio (Node.js 18+, sem dependências).
//
// Fluxo: cadastro informa telefone → backend cria verificação → usuário vai para a página hospedada,
// abre o app de mensagens e envia o SMS → backend recebe webhook assinado E confirma pela API
// → libera o cadastro UMA única vez. A página de retorno nunca é tratada como prova.
//
//   SIMVIO_API_BASE=https://seu-dominio/api SIMVIO_SECRET_KEY=sk_test_... SIMVIO_WEBHOOK_SECRET=whsec_... \
//   PORT=4000 node server.mjs
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, renameSync } from "node:fs";
import { SimvioClient, verifyWebhook } from "./simvio.mjs";

const PORT = Number(process.env.PORT ?? 4000);
const DB_FILE = process.env.EXAMPLE_DB ?? "./example-db.json";
const simvio = new SimvioClient({
  apiBase: required("SIMVIO_API_BASE"),
  secretKey: required("SIMVIO_SECRET_KEY"),
});
const WEBHOOK_SECRET = process.env.SIMVIO_WEBHOOK_SECRET ?? null;

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Defina ${name}`);
  return v;
}

// --- "Banco" do exemplo: arquivo JSON com escrita atômica. Em produção, use seu banco com transação.
const db = existsSync(DB_FILE)
  ? JSON.parse(readFileSync(DB_FILE, "utf8"))
  : { signups: {}, processedEvents: {} };
function save() {
  writeFileSync(`${DB_FILE}.tmp`, JSON.stringify(db, null, 2));
  renameSync(`${DB_FILE}.tmp`, DB_FILE);
}

/**
 * Efeito de negócio aplicado UMA vez: só ativa se a API confirmar status "verified",
 * a referência for deste cadastro e o telefone for o informado.
 */
async function confirmSignup(signupId) {
  const signup = db.signups[signupId];
  if (!signup || signup.status === "active") return signup;
  const v = await simvio.getVerification(signup.verificationId);
  if (v.status === "verified" && v.reference === signup.id && v.phone_number === signup.phone) {
    signup.status = "active";
    signup.activatedAt = new Date().toISOString();
    save();
    console.log(`cadastro ${signup.id} ativado`);
  } else if (["expired", "cancelled", "failed"].includes(v.status)) {
    signup.status = `verification_${v.status}`;
    save();
  }
  return signup;
}

const html = (body) =>
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
   <title>Loja exemplo</title><body style="font-family:system-ui;max-width:480px;margin:40px auto;padding:0 16px">${body}</body>`;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (c) => {
      data += c;
      if (data.length > 64 * 1024) reject(new Error("corpo grande demais"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html(`<h1>Criar conta</h1>
        <form method="post" action="/signup">
          <label>Celular com DDD<br><input name="phone" placeholder="+5511987654321" required></label>
          <p><button>Continuar</button></p></form>`));
    }

    if (req.method === "POST" && url.pathname === "/signup") {
      const form = new URLSearchParams(await readBody(req));
      const phone = String(form.get("phone") ?? "").replace(/[^\d+]/g, "");
      const signup = { id: randomUUID(), phone, status: "pending_phone", attempts: 1 };
      // Idempotency-Key estável por tentativa: se esta requisição for repetida, a sessão é a mesma.
      const v = await simvio.createVerification(
        { phoneNumber: phone, reference: signup.id, purpose: "signup" },
        `${signup.id}:1`,
      );
      signup.verificationId = v.id;
      db.signups[signup.id] = signup;
      save();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(html(`<h1>Confirme seu número</h1>
        <p>Vamos abrir uma página da Simvio para você enviar um SMS de confirmação.</p>
        <p><a href="${v.verification_url}">Confirmar meu número</a></p>
        <p>Depois, volte e <a href="/signup/${signup.id}">veja o status do cadastro</a>.</p>`));
    }

    const m = /^\/signup\/([\w-]+)$/.exec(url.pathname);
    if (req.method === "GET" && m) {
      // Recuperação: se o webhook não chegou, consultamos a API (fonte de verdade).
      const signup = await confirmSignup(m[1]);
      res.writeHead(signup ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
      return res.end(html(signup ? `<h1>Cadastro</h1><p>Status: <strong>${signup.status}</strong></p>` : "Não encontrado"));
    }

    if (req.method === "POST" && url.pathname === "/webhooks/simvio") {
      if (!WEBHOOK_SECRET) {
        res.writeHead(404);
        return res.end();
      }
      const rawBody = await readBody(req);
      let event;
      try {
        event = verifyWebhook({ rawBody, headers: req.headers, secret: WEBHOOK_SECRET });
      } catch (e) {
        res.writeHead(400);
        return res.end(e.message);
      }
      // Entrega é "pelo menos uma vez": deduplicar pelo event_id.
      if (!db.processedEvents[event.event_id]) {
        if (event.type.startsWith("verification.")) {
          const signupId = event.reference;
          if (db.signups[signupId]?.verificationId === event.verification_id) await confirmSignup(signupId);
        }
        db.processedEvents[event.event_id] = new Date().toISOString();
        save();
      }
      res.writeHead(204);
      return res.end();
    }

    res.writeHead(404);
    res.end();
  } catch (e) {
    console.error(e.message);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Erro: ${e.message}`);
  }
});

server.listen(PORT, () => console.log(`exemplo em http://localhost:${PORT}`));
