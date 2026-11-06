import { createContext, Suspense, useCallback, useContext, useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet } from "react-router";
import { ArrowLeft, Building2, CreditCard, KeyRound, LayoutDashboard, LogOut, ScrollText, Users } from "lucide-react";
import QRCode from "qrcode";
import { Logo } from "@/components/brand";
import { CopyButton, LoadError, Loading, PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import { Field, FormError } from "@/components/ui/form";
import { useAction } from "@/lib/action";
import type { ApiError } from "@/lib/api";
import { panel, post, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

interface Mfa {
  enrolled: boolean;
  verified: boolean;
  recovery_codes_left: number;
}

const MfaCtx = createContext<{ recheck: () => void }>(null!);

/** Se a confirmação em dois fatores expirar no meio do uso, a tela volta para o pedido de código. */
export function useAdminError() {
  const { recheck } = useContext(MfaCtx);
  return useCallback(
    (e: ApiError | null) => {
      if (e?.details?.reason === "mfa_required") recheck();
    },
    [recheck],
  );
}

const NAV = [
  { to: "/admin", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/admin/clientes", label: "Clientes", icon: Building2 },
  { to: "/admin/usuarios", label: "Usuários", icon: Users },
  { to: "/admin/planos", label: "Planos", icon: CreditCard },
  { to: "/admin/auditoria", label: "Registro de ações", icon: ScrollText },
];

export default function AdminLayout() {
  const { me, loading, logout } = useSession();
  const [mfa, setMfa] = useState<Mfa | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const load = useCallback(async () => {
    try {
      setMfa(await panel<Mfa>("/admin/mfa"));
      setError(null);
    } catch (e) {
      setError(e as ApiError);
    }
  }, []);

  useEffect(() => {
    if (me?.user.is_super_admin) load();
  }, [me, load]);

  if (loading) return <div className="p-8"><Loading /></div>;
  if (!me) return <Navigate to="/admin/entrar" replace />;
  if (!me.user.is_super_admin) return <Navigate to="/app" replace />;

  let body;
  if (error && !mfa) body = <LoadError error={error} onRetry={load} />;
  else if (!mfa) body = <Loading />;
  else if (!mfa.enrolled) body = <MfaSetup onDone={load} />;
  else if (!mfa.verified) body = <MfaVerify onDone={load} />;
  else
    body = (
      <MfaCtx.Provider value={{ recheck: load }}>
        <Suspense fallback={<Loading />}><Outlet /></Suspense>
      </MfaCtx.Provider>
    );

  return (
    <div className="min-h-dvh">
      <header className="bg-petroleo text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-8">
          <Link to="/admin" className="flex items-center gap-3">
            <Logo negative className="h-10" />
            <span className="rounded-full bg-lima px-3 py-1 text-sm font-bold text-petroleo">Administração</span>
          </Link>
          {mfa?.verified && (
            <nav aria-label="Administração" className="flex flex-wrap gap-1">
              {NAV.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => cn("flex items-center gap-2 rounded-xl px-3 py-2 font-medium", isActive ? "bg-white/15" : "hover:bg-white/10")}
                >
                  <Icon className="size-5" aria-hidden /> {label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="ml-auto flex gap-1">
            {me.organizations.length > 0 && <Link to="/app" className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-white/10"><ArrowLeft className="size-5" aria-hidden /> Painel do cliente</Link>}
            <button onClick={logout} className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-white/10"><LogOut className="size-5" aria-hidden /> Sair</button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">{body}</main>
    </div>
  );
}

function MfaSetup({ onDone }: { onDone: () => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);

  const start = useAction(async () => {
    const s = await post<{ secret: string; otpauth_uri: string }>("/admin/mfa/setup");
    const qr = await QRCode.toDataURL(s.otpauth_uri, { margin: 1, width: 280, color: { dark: "#073E42", light: "#FFFFFF" } });
    setSetup({ ...s, qr });
  });
  const confirm = useAction(async () => {
    const r = await post<{ recovery_codes: string[] }>("/admin/mfa/confirm", { code });
    setSetup(null);
    setCodes(r.recovery_codes);
  });

  if (codes) {
    return (
      <div className="max-w-xl space-y-5">
        <PageHeader title="Guarde os códigos de recuperação" description="Use um deles se perder o celular. Cada código funciona uma única vez e eles não serão mostrados de novo." />
        <Card className="space-y-4">
          <ul className="grid grid-cols-2 gap-2 font-mono text-lg">
            {codes.map((c) => <li key={c} className="rounded-lg bg-mineral px-3 py-2 text-center">{c}</li>)}
          </ul>
          <CopyButton value={codes.join("\n")} label="Copiar códigos" />
        </Card>
        <Button size="lg" onClick={onDone}>Já guardei os códigos</Button>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader
        title="Proteja a administração"
        description="A área de administração exige um código do aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password ou similar)."
      />
      {!setup ? (
        <Card className="space-y-4">
          <p>Tenha o celular em mãos. Você vai ler um QR code e digitar o código de 6 números que aparecer no aplicativo.</p>
          <FormError message={start.error} />
          <Button size="lg" onClick={() => start.run()} disabled={start.busy}><KeyRound aria-hidden /> Começar</Button>
        </Card>
      ) : (
        <Card className="space-y-5">
          <ol className="list-decimal space-y-4 pl-5">
            <li>
              <p>No aplicativo autenticador, escolha adicionar conta e leia este QR code.</p>
              <img src={setup.qr} alt="QR code para o aplicativo autenticador" width={280} height={280} className="mt-3 rounded-xl border border-linha" />
              <details className="mt-3">
                <summary className="cursor-pointer font-semibold">Não consigo ler o QR code</summary>
                <p className="mt-2 text-petroleo-soft">Digite esta chave no aplicativo:</p>
                <code className="mt-1 block break-all rounded-lg bg-mineral p-3 font-mono">{setup.secret}</code>
              </details>
            </li>
            <li>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  confirm.run();
                }}
              >
                <Field label="Código de 6 números" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required />
                <FormError message={confirm.error} />
                <Button size="lg" type="submit" disabled={confirm.busy || code.length !== 6}>Confirmar</Button>
              </form>
            </li>
          </ol>
        </Card>
      )}
    </div>
  );
}

function MfaVerify({ onDone }: { onDone: () => void }) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState("");
  const verify = useAction(async () => {
    await post("/admin/mfa/verify", useRecovery ? { recovery_code: value.trim().toLowerCase() } : { code: value });
    onDone();
  });

  return (
    <div className="max-w-md space-y-5">
      <PageHeader title="Confirme que é você" description="Digite o código que aparece agora no seu aplicativo autenticador." />
      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            verify.run();
          }}
        >
          {useRecovery ? (
            <Field label="Código de recuperação" placeholder="abcde-12345" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} required />
          ) : (
            <Field label="Código de 6 números" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} required autoFocus />
          )}
          <FormError message={verify.error} />
          <Button size="lg" type="submit" className="w-full" disabled={verify.busy || (!useRecovery && value.length !== 6)}>Entrar na administração</Button>
          <button
            type="button"
            className="text-[15px] font-semibold underline underline-offset-4"
            onClick={() => {
              setUseRecovery(!useRecovery);
              setValue("");
            }}
          >
            {useRecovery ? "Usar o aplicativo autenticador" : "Perdi o celular: usar código de recuperação"}
          </button>
        </form>
      </Card>
      <Notice tone="info">A confirmação vale por 12 horas nesta sessão.</Notice>
    </div>
  );
}
