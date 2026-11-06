import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes } from "react-router";
import "./index.css";
import { BigTitle, Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { SessionProvider } from "@/lib/session";

const VerifyPage = lazy(() => import("./pages/VerifyPage"));
const Landing = lazy(() => import("./pages/Landing"));
const Docs = lazy(() => import("./pages/Docs"));
const AppShell = lazy(() => import("./layouts/AppShell"));
const auth = () => import("./pages/Auth");
const LoginPage = lazy(() => auth().then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => auth().then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => auth().then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => auth().then((m) => ({ default: m.ResetPasswordPage })));
const ConfirmEmailPage = lazy(() => auth().then((m) => ({ default: m.ConfirmEmailPage })));
const InvitePage = lazy(() => auth().then((m) => ({ default: m.InvitePage })));
const Overview = lazy(() => import("./pages/app/Overview"));
const Applications = lazy(() => import("./pages/app/Applications"));
const Devices = lazy(() => import("./pages/app/Devices"));
const Verifications = lazy(() => import("./pages/app/Verifications"));
const Webhooks = lazy(() => import("./pages/app/Webhooks"));
const Team = lazy(() => import("./pages/app/Team"));
const Subscription = lazy(() => import("./pages/app/Subscription"));
const Settings = lazy(() => import("./pages/app/Settings"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const admin = () => import("./pages/admin/AdminPages");
const AdminOrganizations = lazy(() => admin().then((m) => ({ default: m.AdminOrganizations })));
const AdminOrganization = lazy(() => admin().then((m) => ({ default: m.AdminOrganization })));
const AdminAudit = lazy(() => admin().then((m) => ({ default: m.AdminAudit })));

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-5">
      <Logo className="h-11 self-start" />
      <BigTitle>Página não encontrada</BigTitle>
      <Button asChild size="lg"><Link to="/">Ir para o início</Link></Button>
    </main>
  );
}

/** Sessão do painel; a página pública de verificação fica fora dela e não consulta a conta. */
function WithSession() {
  return (
    <SessionProvider>
      <Outlet />
    </SessionProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<p className="p-8 text-center text-petroleo-soft">Carregando…</p>}>
        <Routes>
          <Route path="/v/:token" element={<VerifyPage />} />
          <Route path="/documentacao" element={<Docs />} />
          <Route element={<WithSession />}>
            <Route path="/" element={<Landing />} />
            <Route path="/precos" element={<Navigate to="/#planos" replace />} />
            <Route path="/entrar" element={<LoginPage />} />
            <Route path="/cadastro" element={<RegisterPage />} />
            <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
            <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
            <Route path="/confirmar-email" element={<ConfirmEmailPage />} />
            <Route path="/convite" element={<InvitePage />} />
            <Route path="/app" element={<AppShell />}>
              <Route index element={<Overview />} />
              <Route path="aplicacoes" element={<Applications />} />
              <Route path="aparelhos" element={<Devices />} />
              <Route path="verificacoes" element={<Verifications />} />
              <Route path="avisos" element={<Webhooks />} />
              <Route path="equipe" element={<Team />} />
              <Route path="assinatura" element={<Subscription />} />
              <Route path="configuracoes" element={<Settings />} />
            </Route>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminOrganizations />} />
              <Route path="organizacoes/:id" element={<AdminOrganization />} />
              <Route path="auditoria" element={<AdminAudit />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
