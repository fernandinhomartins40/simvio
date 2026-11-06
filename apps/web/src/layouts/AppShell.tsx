import { createContext, Suspense, useContext, useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router";
import { Bell, Bot, ChevronDown, CreditCard, Home, LayoutGrid, ListChecks, LogOut, Menu, Settings, ShieldCheck, Smartphone, Users, X } from "lucide-react";
import { Logo } from "@/components/brand";
import { Loading } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useSession, type Role } from "@/lib/session";
import { cn } from "@/lib/utils";

export type Env = "test" | "live";

interface OrgValue {
  orgId: string;
  orgName: string;
  role: Role;
  canEdit: boolean;
  isOwner: boolean;
  env: Env;
  base: string;
}

const OrgCtx = createContext<OrgValue>(null!);
export const useOrg = () => useContext(OrgCtx);

const NAV = [
  { to: "/app", label: "Início", icon: Home, end: true },
  { to: "/app/aplicacoes", label: "Aplicações", icon: LayoutGrid },
  { to: "/app/aparelhos", label: "Aparelhos", icon: Smartphone },
  { to: "/app/verificacoes", label: "Verificações", icon: ListChecks },
  { to: "/app/avisos", label: "Avisos automáticos", icon: Bell },
  { to: "/app/agentes", label: "Agentes de IA", icon: Bot },
  { to: "/app/equipe", label: "Equipe", icon: Users },
  { to: "/app/assinatura", label: "Assinatura", icon: CreditCard },
];

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* preferência opcional */
  }
}

export default function AppShell() {
  const { me, loading, logout } = useSession();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [orgId, setOrgId] = useState(() => read("simvio.org"));
  const [env, setEnv] = useState<Env>(() => (read("simvio.env") === "live" ? "live" : "test"));

  useEffect(() => setMenuOpen(false), [location.pathname]);

  if (loading) return <div className="p-8"><Loading /></div>;
  if (!me) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;

  const org = me.organizations.find((o) => o.id === orgId) ?? me.organizations[0];
  if (!org) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-8">
        <Logo />
        <p className="text-lg">Sua conta não faz parte de nenhuma organização. Peça um convite ao responsável.</p>
        <Button variant="outline" onClick={logout}>Sair</Button>
      </main>
    );
  }

  const value: OrgValue = {
    orgId: org.id,
    orgName: org.name,
    role: org.role,
    canEdit: org.role !== "viewer",
    isOwner: org.role === "owner",
    env,
    base: `/orgs/${org.id}`,
  };

  const sidebar = (
    <div className="flex h-full flex-col gap-6 bg-petroleo p-5 text-white">
      <Link to="/app"><Logo negative className="h-14" /></Link>
      {me.organizations.length > 1 ? (
        <div className="relative">
          <label className="sr-only" htmlFor="org">Organização</label>
          <select
            id="org"
            value={org.id}
            onChange={(e) => {
              setOrgId(e.target.value);
              write("simvio.org", e.target.value);
            }}
            className="w-full appearance-none rounded-xl border border-white/25 bg-transparent px-3 py-2.5 pr-8 font-semibold [&>option]:text-petroleo"
          >
            {me.organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-3 size-4" aria-hidden />
        </div>
      ) : (
        <p className="truncate rounded-xl border border-white/25 px-3 py-2.5 font-semibold">{org.name}</p>
      )}
      <nav aria-label="Principal" className="flex flex-1 flex-col gap-1">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn("flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium transition-colors", isActive ? "bg-lima font-bold text-petroleo" : "hover:bg-white/10")
            }
          >
            <Icon className="size-5" aria-hidden /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="flex flex-col gap-1 border-t border-white/15 pt-3">
        {me.user.is_super_admin && (
          <NavLink to="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/10"><ShieldCheck className="size-5" aria-hidden /> Administração</NavLink>
        )}
        <NavLink to="/app/configuracoes" className={({ isActive }) => cn("flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white/10", isActive && "bg-white/10")}>
          <Settings className="size-5" aria-hidden /> Configurações
        </NavLink>
        <button onClick={logout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/10">
          <LogOut className="size-5" aria-hidden /> Sair
        </button>
      </div>
    </div>
  );

  return (
    <OrgCtx.Provider value={value}>
      <div className="min-h-dvh lg:pl-72">
        <aside className="fixed inset-y-0 left-0 hidden w-72 lg:block">{sidebar}</aside>
        {menuOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-petroleo/40" onClick={() => setMenuOpen(false)} aria-hidden />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">{sidebar}</div>
            <button aria-label="Fechar menu" className="absolute right-4 top-4 rounded-lg bg-white p-2" onClick={() => setMenuOpen(false)}><X className="size-5" /></button>
          </div>
        )}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-linha bg-mineral/95 px-4 py-3 backdrop-blur sm:px-8">
          <button aria-label="Abrir menu" className="rounded-lg p-2 hover:bg-white lg:hidden" onClick={() => setMenuOpen(true)}><Menu className="size-6" /></button>
          <div role="group" aria-label="Ambiente" className="ml-auto flex rounded-full border border-linha bg-white p-1">
            {(["test", "live"] as const).map((e) => (
              <button
                key={e}
                aria-pressed={env === e}
                onClick={() => {
                  setEnv(e);
                  write("simvio.env", e);
                }}
                className={cn("rounded-full px-4 py-1.5 text-sm font-semibold", env === e ? (e === "test" ? "bg-lima" : "bg-petroleo text-white") : "text-petroleo-soft")}
              >
                {e === "test" ? "Teste" : "Produção"}
              </button>
            ))}
          </div>
          <span className="hidden max-w-48 truncate text-sm font-semibold sm:block">{me.user.name}</span>
        </header>
        <main key={org.id} className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </OrgCtx.Provider>
  );
}
