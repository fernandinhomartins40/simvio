import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import QRCode from "qrcode";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Info,
  MessageSquareText,
  RefreshCw,
  Signal,
  Smartphone,
  WifiOff,
  XCircle,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { BigTitle, Logo, Symbol } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";

interface PublicSession {
  status: "pending" | "verified" | "expired" | "cancelled" | "failed";
  hint: "wrong_sender" | null;
  application_name: string;
  phone_hint: string;
  receiver_number: string | null;
  receiver_display: string | null;
  message_body: string | null;
  sms_uri: string | null;
  expires_at: string;
  server_time: string;
  redirect_url: string | null;
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isMobile = () => /Android|iPad|iPhone|iPod|Mobile/i.test(navigator.userAgent);

/** iOS usa "&body=" no link sms:; Android usa "?body=". */
function composerHref(s: PublicSession) {
  if (!s.receiver_number || !s.message_body) return undefined;
  const sep = isIOS() ? "&" : "?";
  return `sms:${s.receiver_number}${sep}body=${encodeURIComponent(s.message_body)}`;
}

function useCountdown(expiresAt?: string, serverTime?: string) {
  const offset = useMemo(() => (serverTime ? Date.parse(serverTime) - Date.now() : 0), [serverTime]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!expiresAt) return { left: 0, label: "--:--" };
  const left = Math.max(0, Math.floor((Date.parse(expiresAt) - (now + offset)) / 1000));
  return { left, label: `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}` };
}

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="text-sm text-petroleo-soft">{label}</div>
        <div className={mono ? "break-all font-mono text-lg font-bold" : "text-xl font-bold"}>{value}</div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Copiar ${label.toLowerCase()}`}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="text-sucesso" /> : <Copy />}
      </Button>
      <span className="sr-only" aria-live="polite">{copied ? `${label} copiado` : ""}</span>
    </div>
  );
}

function SmsQr({ value }: { value: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 320, color: { dark: "#073E42", light: "#FFFFFF" } }).then(setSrc);
  }, [value]);
  return src ? <img src={src} alt="QR que abre o aplicativo de mensagens com o número e o texto preenchidos" className="size-40 rounded-lg" /> : null;
}

function Shell({ children, appName }: { children: React.ReactNode; appName?: string }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white sm:bg-mineral">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 bg-white px-5 py-6 sm:my-8 sm:rounded-3xl sm:border sm:border-linha sm:px-8">
        <header className="flex items-center justify-between">
          <Logo className="h-11" />
          {appName && <span className="truncate text-sm text-petroleo-soft">para {appName}</span>}
        </header>
        {children}
        <footer className="mt-auto flex items-center gap-2 border-t border-linha pt-4 text-sm text-petroleo-soft">
          <Symbol className="h-5" /> Verificação por Simvio
        </footer>
      </main>
    </div>
  );
}

function StateHero({ tone, icon: Icon }: { tone: "ok" | "warn" | "error"; icon: typeof Check }) {
  const cls = { ok: "bg-sucesso text-white", warn: "bg-amber-400 text-petroleo", error: "bg-erro text-white" }[tone];
  return (
    <div className="flex justify-center py-2">
      <div className={`flex size-24 items-center justify-center rounded-full ${cls}`}>
        <Icon className="size-12" aria-hidden />
      </div>
    </div>
  );
}

export default function VerifyPage() {
  const { token = "" } = useParams();
  const [session, setSession] = useState<PublicSession | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [opened, setOpened] = useState(false);
  const [help, setHelp] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    try {
      const s = await api<PublicSession>(`/public/sessions/${encodeURIComponent(token)}`);
      setSession(s);
      setError(null);
      return s;
    } catch (e) {
      setError(e as ApiError);
      return e as ApiError;
    }
  }, [token]);

  // Consulta o estado até ficar final. Mais devagar com a aba em segundo plano.
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      const r = await load();
      if (stop) return;
      if (r instanceof ApiError ? r.status === 404 : r.status !== "pending") return;
      timer.current = setTimeout(tick, document.hidden ? 8000 : 2500);
    };
    tick();
    const onVisible = () => !document.hidden && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const { left, label } = useCountdown(session?.expires_at, session?.server_time);
  const effectiveStatus = session?.status === "pending" && left === 0 ? "expired" : session?.status;

  if (!session && error?.status === 404) {
    return (
      <Shell>
        <StateHero tone="error" icon={XCircle} />
        <BigTitle>Link inválido</BigTitle>
        <p className="text-lg text-petroleo-soft">Este link de verificação não existe ou já foi encerrado. Volte ao site ou aplicativo onde você começou.</p>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        {error ? (
          <>
            <StateHero tone="warn" icon={WifiOff} />
            <BigTitle>Sem conexão</BigTitle>
            <p className="text-lg text-petroleo-soft">{error.message}</p>
            <Button size="lg" onClick={load}><RefreshCw /> Tentar de novo</Button>
          </>
        ) : (
          <p className="py-16 text-center text-petroleo-soft" role="status">Carregando…</p>
        )}
      </Shell>
    );
  }

  const app = session.application_name;

  if (effectiveStatus === "verified") {
    return (
      <Shell appName={app}>
        <StateHero tone="ok" icon={Check} />
        <BigTitle className="text-center">Número confirmado</BigTitle>
        <p className="text-center text-lg text-petroleo-soft">Seu número de celular foi verificado com sucesso.</p>
        {session.redirect_url ? (
          <Button size="lg" asChild>
            <a href={session.redirect_url} rel="noreferrer">Continuar para {app} <ArrowRight /></a>
          </Button>
        ) : (
          <Notice tone="success"><CheckCircle2 className="size-5 shrink-0" aria-hidden /> Você já pode voltar para {app}.</Notice>
        )}
      </Shell>
    );
  }

  if (effectiveStatus === "expired") {
    return (
      <Shell appName={app}>
        <StateHero tone="warn" icon={Clock} />
        <BigTitle>O tempo acabou</BigTitle>
        <p className="text-lg text-petroleo-soft">Por segurança, o link tem um tempo limite. Volte para {app} e comece uma nova verificação.</p>
        <Notice tone="info"><Info className="size-5 shrink-0" aria-hidden /> Se você enviou o SMS depois do prazo, ele não será considerado.</Notice>
      </Shell>
    );
  }

  if (effectiveStatus === "cancelled" || effectiveStatus === "failed") {
    return (
      <Shell appName={app}>
        <StateHero tone="error" icon={XCircle} />
        <BigTitle>Verificação encerrada</BigTitle>
        <p className="text-lg text-petroleo-soft">Esta verificação não está mais disponível. Volte para {app} para tentar de novo.</p>
      </Shell>
    );
  }

  const href = composerHref(session);
  const openComposer = () => setOpened(true);

  if (session.hint === "wrong_sender") {
    return (
      <Shell appName={app}>
        <StateHero tone="error" icon={Smartphone} />
        <BigTitle>Confira a linha usada</BigTitle>
        <p className="text-lg text-petroleo-soft">
          Recebemos um SMS de outro número. Envie pelo mesmo número informado, que termina em <strong className="text-petroleo">{session.phone_hint.slice(-4)}</strong>.
        </p>
        <Card className="space-y-2">
          <p className="font-semibold">Tem dois chips?</p>
          <p className="text-petroleo-soft">No aplicativo de mensagens, escolha o chip do número {session.phone_hint} antes de enviar.</p>
        </Card>
        {href && <Button size="lg" asChild><a href={href} onClick={openComposer}><MessageSquareText /> Abrir mensagens</a></Button>}
        <p className="text-center text-sm text-petroleo-soft">Número errado? Volte para {app} e corrija. Tempo restante: {label}</p>
      </Shell>
    );
  }

  return (
    <Shell appName={app}>
      {!opened ? (
        <>
          <BigTitle>Envie um SMS para confirmar</BigTitle>
          <p className="text-lg text-petroleo-soft">Abra seu aplicativo de mensagens e envie o SMS abaixo, sem alterar o texto.</p>
          <Card className="divide-y divide-linha py-1">
            <CopyField label="Para" value={session.receiver_display ?? ""} />
            <CopyField label="Mensagem" value={session.message_body ?? ""} mono />
          </Card>
          {isMobile() ? (
            href && <Button size="lg" asChild><a href={href} onClick={openComposer}><MessageSquareText /> Abrir mensagens <ArrowRight /></a></Button>
          ) : (
            <Card className="flex items-center gap-4">
              {session.sms_uri && <SmsQr value={session.sms_uri} />}
              <div className="space-y-2">
                <p className="font-semibold">Está no computador?</p>
                <p className="text-sm text-petroleo-soft">Escaneie com a câmera do celular do número {session.phone_hint}. O app de mensagens abre preenchido.</p>
                <Button variant="outline" size="sm" onClick={openComposer}>Já enviei</Button>
              </div>
            </Card>
          )}
          <Notice tone="info">
            <Info className="size-5 shrink-0 text-info" aria-hidden />
            <span>Vamos abrir seu aplicativo de mensagens. Confirme o envio do SMS para verificar este número. Sua operadora pode cobrar pelo envio.</span>
          </Notice>
          <p className="text-center text-sm text-petroleo-soft">Envie do número {session.phone_hint} · Tempo restante: <span className="font-semibold tabular-nums">{label}</span></p>
        </>
      ) : (
        <>
          <BigTitle>Aguardando seu SMS</BigTitle>
          <p className="text-lg text-petroleo-soft">Assim que recebermos seu SMS, vamos confirmar automaticamente.</p>
          <div className="flex flex-col items-center gap-2 py-2" role="timer" aria-live="off">
            <div className="relative flex size-36 items-center justify-center rounded-full border-8 border-lima/40">
              <MessageSquareText className="size-10" aria-hidden />
              <span className="absolute -bottom-1 rounded-full bg-white px-2 text-2xl font-extrabold tabular-nums">{label}</span>
            </div>
          </div>
          <p className="text-center text-petroleo-soft" role="status">Já enviou? Aguarde a confirmação nesta página.</p>
          {href && (
            <Button variant="outline" size="lg" asChild>
              <a href={href}><RefreshCw /> Abrir mensagens novamente</a>
            </Button>
          )}
          <Button variant="ghost" onClick={() => setHelp((h) => !h)} aria-expanded={help}>Não conseguiu enviar?</Button>
          {help && (
            <Card className="space-y-4">
              <HelpItem icon={Signal} title="Saldo e cobertura" text="Confira se há crédito para SMS e sinal de rede." />
              <HelpItem icon={Smartphone} title="Chip certo" text={`Envie pelo chip do número ${session.phone_hint}.`} />
              <HelpItem icon={AlertTriangle} title="Precisa ser SMS" text="Se o app enviar como mensagem de chat (RCS ou iMessage), desative essa opção e envie como SMS comum." />
            </Card>
          )}
        </>
      )}
    </Shell>
  );
}

function HelpItem({ icon: Icon, title, text }: { icon: typeof Info; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lima/30"><Icon className="size-5" aria-hidden /></span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm text-petroleo-soft">{text}</p>
      </div>
    </div>
  );
}
