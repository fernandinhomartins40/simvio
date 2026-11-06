import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhook } from "./simvio.mjs";

const secret = "whsec_teste";
function signed(payload, ts = Math.floor(Date.now() / 1000)) {
  const rawBody = JSON.stringify(payload);
  const sig = createHmac("sha256", secret).update(`${ts}.${payload.event_id}.${rawBody}`).digest("hex");
  return { rawBody, headers: { "simvio-event-id": payload.event_id, "simvio-timestamp": String(ts), "simvio-signature": `v1=${sig}` } };
}

test("aceita assinatura válida", () => {
  const { rawBody, headers } = signed({ event_id: "evt_1", type: "verification.verified" });
  assert.equal(verifyWebhook({ rawBody, headers, secret }).event_id, "evt_1");
});

test("recusa corpo alterado, segredo errado e timestamp antigo", () => {
  const { rawBody, headers } = signed({ event_id: "evt_1", type: "verification.verified" });
  assert.throws(() => verifyWebhook({ rawBody: rawBody.replace("verified", "expired"), headers, secret }));
  assert.throws(() => verifyWebhook({ rawBody, headers, secret: "outro" }));
  const old = signed({ event_id: "evt_2" }, Math.floor(Date.now() / 1000) - 3600);
  assert.throws(() => verifyWebhook({ ...old, secret }));
});
