import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { CheckCircle2, MailCheck } from "lucide-react";
import { BigTitle, Logo } from "@/components/brand";
import { Loading } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/card";
import { Field, FormError } from "@/components/ui/form";
import { takeHashToken, useAction } from "@/lib/action";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

/** Chamadas públicas de conta (sem sessão; o servidor confere a origem). */
const send = (path: string, body: unknown) => api<{ status: string }>(path, { method: "POST", body: JSON.stringify(body) });

function AuthLayout({ title, text, children, footer }: { title: string; text?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-mineral lg:flex-row">
      <aside className="hidden flex-1 flex-col justify-between bg-petroleo p-10 text-white lg:flex">
        <Link to="/"><Logo negative className="h-14" /></Link>
        <div className="space-y-4">
          <p className="text-4xl font-extrabold leading-tight tracking-tight">
            Seu número. Sua confirmação<span className="text-lima">.</span>
          </p>
          <p className="max-w-md text-lg text-white/80">O usuário envia o SMS do próprio celular para o seu Android receptor. Mensalidade fixa, sem créditos por mensagem.</p>
        </div>
        <img src="/brand/07-faixa-lima-hero.png" alt="" aria-hidden className="w-2/3 self-end object-contain" />
      </aside>
      <main className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md space-y-6">
          <Link to="/" className="lg:hidden"><Logo className="h-11" /></Link>
          <div className="space-y-2">
            <BigTitle className="text-3xl sm:text-4xl">{title}</BigTitle>
            {text && <p className="text-lg text-petroleo-soft">{text}</p>}
          </div>
          {children}
          {footer && <div className="space-y-2 border-t border-linha pt-4 text-[15px]">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

const linkCls = "font-semibold underline underline-offset-4";

function Done({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <AuthLayout title={title}>
      <Notice tone="success">
        <MailCheck className="size-6 shrink-0" aria-hidden />
        <p>{text}</p>
      </Notice>
      {action}
    </AuthLayout>
  );
}

export function LoginPage() {
  const { me, refresh } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? "/app";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [unverified, setUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  const login = useAction(async () => {
    setUnverified(false);
    try {
      await send("/auth/login", { email, password });
    } catch (e) {
      if (e instanceof ApiError && e.details?.reason === "email_not_verified") setUnverified(true);
      throw e;
    }
    await refresh();
    navigate(from.startsWith("/app") ? from : "/app", { replace: true });
  });
  const resend = useAction(async () => {
    await send("/auth/resend-verification", { email });
    setResent(true);
  });

  if (me) return <Navigate to="/app" replace />;

  return (
    <AuthLayout
      title="Entrar"
      text="Acesse o painel da sua organização."
      footer={
        <>
          <p>Ainda não tem conta? <Link to="/cadastro" className={linkCls}>Criar conta</Link></p>
          <p><Link to="/recuperar-senha" className={linkCls}>Esqueci minha senha</Link></p>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          login.run();
        }}
      >
        <Field label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Senha" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={login.error} />
        {unverified && (
          <Notice tone="info" className="flex-col">
            <p>Confirme seu e-mail pelo link que enviamos antes de entrar.</p>
            {resent ? (
              <p className="font-semibold">Se a conta existir, um novo link foi enviado.</p>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={resend.busy} onClick={() => resend.run()}>Enviar novo link</Button>
            )}
          </Notice>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={login.busy}>{login.busy ? "Entrando…" : "Entrar"}</Button>
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", organization_name: "" });
  const [done, setDone] = useState(false);
  const reg = useAction(async () => {
    await send("/auth/register", form);
    setDone(true);
  });
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  if (done) {
    return (
      <Done
        title="Confira seu e-mail"
        text={`Enviamos um link de confirmação para ${form.email}. Abra o link para ativar a conta e depois entre no painel.`}
        action={<Button asChild variant="outline" size="lg" className="w-full"><Link to="/entrar">Ir para o login</Link></Button>}
      />
    );
  }

  return (
    <AuthLayout
      title="Criar conta"
      text="Comece no ambiente de teste, sem cartão. Produção depende do plano contratado."
      footer={<p>Já tem conta? <Link to="/entrar" className={linkCls}>Entrar</Link></p>}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          reg.run();
        }}
      >
        <Field label="Seu nome" autoComplete="name" required minLength={2} maxLength={80} value={form.name} onChange={set("name")} />
        <Field label="E-mail de trabalho" type="email" autoComplete="email" required value={form.email} onChange={set("email")} />
        <Field label="Nome da empresa ou projeto" required minLength={2} maxLength={80} value={form.organization_name} onChange={set("organization_name")} />
        <Field
          label="Senha"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          hint="Ao menos 10 caracteres. Uma frase longa é mais fácil de lembrar."
          value={form.password}
          onChange={set("password")}
        />
        <FormError message={reg.error} />
        <Button type="submit" size="lg" className="w-full" disabled={reg.busy}>{reg.busy ? "Criando…" : "Criar conta"}</Button>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const act = useAction(async () => {
    await send("/auth/forgot-password", { email });
    setDone(true);
  });

  if (done) {
    return <Done title="Confira seu e-mail" text="Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. O link vale por pouco tempo." />;
  }
  return (
    <AuthLayout title="Recuperar senha" text="Informe o e-mail da conta. Enviaremos um link para criar uma nova senha." footer={<p><Link to="/entrar" className={linkCls}>Voltar para o login</Link></p>}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          act.run();
        }}
      >
        <Field label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <FormError message={act.error} />
        <Button type="submit" size="lg" className="w-full" disabled={act.busy}>Enviar link</Button>
      </form>
    </AuthLayout>
  );
}

function MissingToken() {
  return (
    <AuthLayout title="Link incompleto" text="Abra o link exatamente como chegou no seu e-mail. Se ele expirou, peça um novo.">
      <Button asChild size="lg" className="w-full"><Link to="/entrar">Ir para o login</Link></Button>
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [token] = useState(takeHashToken);
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const act = useAction(async () => {
    await send("/auth/reset-password", { token, password });
    setDone(true);
  });

  if (!token) return <MissingToken />;
  if (done) {
    return (
      <Done
        title="Senha alterada"
        text="Sua nova senha já vale. Por segurança, encerramos as sessões abertas em outros aparelhos."
        action={<Button asChild size="lg" className="w-full"><Link to="/entrar">Entrar</Link></Button>}
      />
    );
  }
  return (
    <AuthLayout title="Nova senha" text="Escolha uma senha nova para a sua conta.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          act.run();
        }}
      >
        <Field label="Nova senha" type="password" autoComplete="new-password" required minLength={10} maxLength={128} hint="Ao menos 10 caracteres." value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={act.error} />
        <Button type="submit" size="lg" className="w-full" disabled={act.busy}>Salvar nova senha</Button>
      </form>
    </AuthLayout>
  );
}

export function ConfirmEmailPage() {
  const [token] = useState(takeHashToken);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    send("/auth/verify-email", { token })
      .then(() => alive && setState("ok"))
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [token]);

  if (!token) return <MissingToken />;
  if (state === "loading") return <AuthLayout title="Confirmando e-mail"><Loading /></AuthLayout>;
  if (state === "error") {
    return (
      <AuthLayout title="Link inválido ou expirado" text="Entre com seu e-mail e senha para receber um novo link de confirmação.">
        <Button asChild size="lg" className="w-full"><Link to="/entrar">Ir para o login</Link></Button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="E-mail confirmado">
      <Notice tone="success"><CheckCircle2 className="size-6 shrink-0" aria-hidden /><p>Tudo certo. Agora você já pode entrar no painel.</p></Notice>
      <Button asChild size="lg" className="w-full"><Link to="/entrar">Entrar</Link></Button>
    </AuthLayout>
  );
}

export function InvitePage() {
  const { me, refresh } = useSession();
  const navigate = useNavigate();
  const [token] = useState(takeHashToken);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [created, setCreated] = useState(false);

  const accept = useAction(async (body: Record<string, string>) => {
    try {
      await send("/invitations/accept", { token, ...body });
    } catch (e) {
      if (e instanceof ApiError && e.details?.reason === "login_required") setNeedLogin(true);
      throw e;
    }
    if (me) {
      await refresh();
      navigate("/app", { replace: true });
    } else {
      setCreated(true);
    }
  });

  if (!token) return <MissingToken />;
  if (created) {
    return (
      <Done
        title="Bem-vindo à equipe"
        text="Sua conta foi criada. Entre com o e-mail do convite e a senha que você escolheu."
        action={<Button asChild size="lg" className="w-full"><Link to="/entrar">Entrar</Link></Button>}
      />
    );
  }
  if (me) {
    return (
      <AuthLayout title="Aceitar convite" text={`Você está conectado como ${me.user.email}. O convite precisa ter sido enviado para este e-mail.`}>
        <FormError message={accept.error} />
        <Button size="lg" className="w-full" disabled={accept.busy} onClick={() => accept.run({})}>Aceitar convite</Button>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title="Aceitar convite"
      text="Crie seu acesso para entrar na equipe. Se você já tem conta com o e-mail convidado, entre primeiro e abra o link de novo."
      footer={<p>Já tem conta? <Link to="/entrar" state={{ from: "/app" }} className={linkCls}>Entrar</Link></p>}
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          accept.run({ name, password });
        }}
      >
        <Field label="Seu nome" autoComplete="name" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Senha" type="password" autoComplete="new-password" required minLength={10} maxLength={128} hint="Ao menos 10 caracteres." value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={accept.error} />
        {needLogin && <Notice tone="info"><p>Este e-mail já tem conta. Entre com ela e abra o link do convite novamente.</p></Notice>}
        <Button type="submit" size="lg" className="w-full" disabled={accept.busy}>Criar acesso e entrar na equipe</Button>
      </form>
    </AuthLayout>
  );
}
