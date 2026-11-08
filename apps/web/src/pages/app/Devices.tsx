import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Link } from "react-router";
import { CheckCircle2, Plus, Smartphone } from "lucide-react";
import { deviceHealthStatus, EmptyState, LoadError, Loading, PageHeader, StatusBadge, type Tone } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Field, FormError } from "@/components/ui/form";
import { useOrg } from "@/layouts/AppShell";
import { useAction } from "@/lib/action";
import { dateTime, relative } from "@/lib/format";
import { panel, patch, post, useResource } from "@/lib/session";
import type { Device, LineStatus, Pairing } from "@/lib/types";
import { formatPhone } from "@simvio/contracts";

const lineStatus: Record<LineStatus, { tone: Tone; label: string }> = {
  active: { tone: "ok", label: "Linha confirmada" },
  pending_check: { tone: "warn", label: "Linha aguardando teste" },
  disabled: { tone: "off", label: "Linha desativada" },
};

export default function DevicesPage() {
  const { base, canEdit } = useOrg();
  const { data, error, loading, reload } = useResource<Device[]>(`${base}/devices`, { interval: 30_000 });
  const [pairing, setPairing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = data?.find((d) => d.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Aparelhos"
        description="Androids com o seu chip que recebem os SMS dos usuários."
        action={canEdit && <Button onClick={() => setPairing(true)}><Plus aria-hidden /> Conectar aparelho</Button>}
      />
      {loading && !data && <Loading />}
      {error && !data && <LoadError error={error} onRetry={reload} />}
      {data?.length === 0 && (
        <EmptyState
          icon={Smartphone}
          title="Nenhum aparelho conectado"
          text="Use um Android com chip ativo e o app Simvio. A conexão é feita lendo um QR do painel."
          action={canEdit && <Button onClick={() => setPairing(true)}><Plus aria-hidden /> Conectar aparelho</Button>}
        />
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {data?.map((d) => {
          const h = deviceHealthStatus[d.health] ?? deviceHealthStatus.offline!;
          return (
            <Card key={d.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-bold">{d.name}</h2>
                  <p className="truncate text-petroleo-soft">{[d.manufacturer, d.model].filter(Boolean).join(" ") || "Modelo não informado"}</p>
                </div>
                <StatusBadge tone={h.tone}>{h.label}</StatusBadge>
              </div>
              {d.line ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{formatPhone(d.line.phone_number)}</span>
                  <StatusBadge tone={lineStatus[d.line.status].tone}>{lineStatus[d.line.status].label}</StatusBadge>
                </div>
              ) : (
                d.status === "active" && <p className="text-[15px]">Número do chip ainda não cadastrado no app.</p>
              )}
              <p className="text-sm text-petroleo-soft">Último contato do app {relative(d.last_seen_at)}</p>
              <Button variant="outline" className="mt-auto self-start" onClick={() => setOpenId(d.id)}>Detalhes</Button>
            </Card>
          );
        })}
      </div>
      {data && data.length > 0 && (
        <p className="text-sm text-petroleo-soft">“Comunicando” significa que o app falou com a Simvio recentemente. Isso não garante a recepção de SMS: confirme com um teste real.</p>
      )}

      {pairing && <PairDrawer onClose={() => setPairing(false)} onPaired={reload} />}
      {open && <DeviceDrawer device={open} onClose={() => setOpenId(null)} onChange={reload} />}
    </>
  );
}

function PairDrawer({ onClose, onPaired }: { onClose: () => void; onPaired: () => void }) {
  const { base } = useOrg();
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [used, setUsed] = useState(false);
  const [expired, setExpired] = useState(false);
  const start = useAction(async () => {
    setUsed(false);
    setExpired(false);
    setQr(null);
    const p = await post<Pairing>(`${base}/pairings`);
    setPairing(p);
    setQr(await QRCode.toDataURL(p.qr_payload, { margin: 1, width: 320, color: { dark: "#073E42", light: "#FFFFFF" } }));
  });

  // Gera um único código ao abrir (a referência evita um segundo pareamento no StrictMode).
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    start.run();
  });

  useEffect(() => {
    if (!pairing || used || expired) return;
    let alive = true;
    const poll = async () => {
      try {
        const s = await panel<{ used: boolean }>(`${base}/pairings/${pairing.id}`);
        if (alive && s.used) {
          setUsed(true);
          onPaired();
        }
      } catch {
        /* tenta de novo no próximo ciclo */
      }
      if (alive && Date.parse(pairing.expires_at) <= Date.now()) setExpired(true);
    };
    const t = setInterval(() => !document.hidden && poll(), 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [base, pairing, used, expired, onPaired]);

  return (
    <Drawer open onClose={onClose} title="Conectar aparelho" description="Use um Android dedicado, com o chip que vai receber os SMS.">
      {used ? (
        <>
          <Notice tone="success"><CheckCircle2 className="size-6 shrink-0" aria-hidden /><p>Aparelho conectado. Agora siga o app para cadastrar e testar o número do chip.</p></Notice>
          <Button size="lg" onClick={onClose}>Concluir</Button>
        </>
      ) : (
        <>
          <ol className="list-decimal space-y-2 pl-5 text-[15px]">
            <li>Instale o app <strong>Simvio</strong> no Android.</li>
            <li>Abra o app e toque em <strong>Ler QR do painel</strong>.</li>
            <li>Aponte a câmera para o código abaixo. Se preferir, digite o código manual.</li>
          </ol>
          {start.busy && <Loading />}
          <FormError message={start.error} />
          {start.error && <Button asChild variant="outline" size="sm" className="self-start"><Link to="/app/assinatura">Ver assinatura</Link></Button>}
          {pairing && !expired && (
            <Card className="flex flex-col items-center gap-4">
              {qr && <img src={qr} alt="QR de conexão do aparelho" className="size-56 rounded-lg" />}
              <div className="text-center">
                <p className="text-sm text-petroleo-soft">Código manual</p>
                <p className="font-mono text-2xl font-bold tracking-widest">{pairing.code}</p>
              </div>
              <p role="status" className="text-sm text-petroleo-soft">Aguardando o aparelho… vale até {dateTime(pairing.expires_at)}.</p>
            </Card>
          )}
          {expired && (
            <Notice tone="warn" className="flex-col">
              <p>O código expirou. Gere outro para continuar.</p>
              <Button size="sm" variant="outline" onClick={() => start.run()}>Gerar novo código</Button>
            </Notice>
          )}
          {pairing && <p className="text-sm text-petroleo-soft">O código é de uso único. Não compartilhe: quem o usar conecta um aparelho à sua organização.</p>}
        </>
      )}
    </Drawer>
  );
}

const DIAG_LABELS: Record<string, string> = {
  receive_sms_permission: "Permissão de SMS",
  notifications_permission: "Permissão de notificações",
  battery_optimization_ignored: "Fora da economia de bateria",
  background_restricted: "Restrito em segundo plano",
  network: "Rede",
  pending_events: "SMS aguardando envio",
  last_sms_event_at: "Último SMS processado",
  last_delivery_error: "Último erro de envio",
};

function diagValue(key: string, v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (key === "last_sms_event_at" && typeof v === "string") return dateTime(v);
  if (key === "network") return { wifi: "Wi-Fi", cellular: "Dados móveis", ethernet: "Cabo", none: "Sem conexão", other: "Outra" }[String(v)] ?? String(v);
  return String(v);
}

function DeviceDrawer({ device, onClose, onChange }: { device: Device; onClose: () => void; onChange: () => void }) {
  const { base, canEdit } = useOrg();
  const [name, setName] = useState(device.name);
  const rename = useAction(async () => {
    await patch(`${base}/devices/${device.id}`, { name });
    onChange();
  });
  const revoke = useAction(async () => {
    if (!confirm("Revogar este aparelho? Ele para de receber verificações na hora e as verificações pendentes nele falham.")) return;
    await post(`${base}/devices/${device.id}/revoke`);
    onChange();
    onClose();
  });
  const diag = device.diagnostics ?? {};
  const warnings = [
    diag.receive_sms_permission === false && "O app está sem permissão para receber SMS.",
    diag.background_restricted === true && "O Android está restringindo o app em segundo plano.",
    typeof diag.pending_events === "number" && diag.pending_events > 0 && "Há SMS aguardando envio para a Simvio. Verifique a internet do aparelho.",
  ].filter(Boolean) as string[];

  return (
    <Drawer open onClose={onClose} title={device.name}>
      {warnings.map((w) => <Notice key={w} tone="warn"><p>{w}</p></Notice>)}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[15px]">
        <dt className="text-petroleo-soft">Situação</dt><dd>{(deviceHealthStatus[device.health] ?? deviceHealthStatus.offline!).label}</dd>
        <dt className="text-petroleo-soft">Último contato</dt><dd>{relative(device.last_seen_at)}</dd>
        <dt className="text-petroleo-soft">Número</dt><dd>{device.line ? formatPhone(device.line.phone_number) : "—"}</dd>
        <dt className="text-petroleo-soft">Android</dt><dd>{device.android_version ?? "—"}</dd>
        <dt className="text-petroleo-soft">Versão do app</dt><dd>{device.app_version ?? "—"}</dd>
        <dt className="text-petroleo-soft">Conectado em</dt><dd>{dateTime(device.paired_at)}</dd>
      </dl>

      {Object.keys(diag).length > 0 && (
        <Card className="space-y-2">
          <h3 className="font-bold">Diagnóstico enviado pelo app</h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {Object.entries(DIAG_LABELS).filter(([k]) => k in diag).map(([k, label]) => (
              <div key={k} className="contents"><dt className="text-petroleo-soft">{label}</dt><dd className="break-words">{diagValue(k, diag[k])}</dd></div>
            ))}
          </dl>
        </Card>
      )}

      {canEdit && device.status === "active" && (
        <>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); rename.run(); }}>
            <Field label="Nome do aparelho" className="flex-1" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="outline" disabled={rename.busy}>Salvar</Button>
          </form>
          <FormError message={rename.error ?? revoke.error} />
          <Button variant="danger" disabled={revoke.busy} onClick={() => revoke.run()}>Revogar aparelho</Button>
        </>
      )}
    </Drawer>
  );
}
