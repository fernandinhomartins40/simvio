import { useEffect } from "react";
import { Link, useLocation } from "react-router";
import { ArrowRight, CheckCircle2, Code2, Smartphone, Wallet } from "lucide-react";
import { BigTitle, Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/lib/session";

// Publicado pelo workflow android-apk.yml.
const APK_URL = "https://github.com/fernandinhomartins40/simvio/releases/download/receptor/simvio-receptor.apk";

/** Planos de referência do PRD (§ planos). Sem cotas de mensagens: a cobrança é só a mensalidade. */
export const PLANS = [
  { name: "Essencial", price: 79, apps: 1, devices: 1, text: "Para validar um produto." },
  { name: "Profissional", price: 179, apps: 5, devices: 2, text: "Para mais de um produto ou redundância de aparelho." },
  { name: "Agência", price: 399, apps: 20, devices: 5, text: "Para quem atende vários clientes." },
];

const FAQ = [
  ["Meus usuários precisam instalar alguma coisa?", "Não. O usuário envia um SMS pelo aplicativo de mensagens que já tem no celular. Quem instala o app Simvio Receptor é você, no Android que fica com o seu chip."],
  ["Preciso comprar créditos por mensagem?", "Não. A Simvio cobra uma mensalidade fixa por plano. Não há créditos, tarifa por verificação nem excedente automático. O SMS enviado pelo usuário pode ser cobrado pela operadora dele."],
  ["Posso usar qualquer Android?", "O app funciona a partir do Android 8. Cada fabricante controla o funcionamento em segundo plano de um jeito; o painel mostra o diagnóstico do aparelho e recomendamos testar com SMS real antes de entrar em produção."],
  ["A Simvio envia código por SMS?", "Não. Quem envia é o usuário, do próprio número. Isso comprova que ele tem o chip em mãos, sem você pagar por mensagens enviadas."],
  ["Como funciona a integração?", "Seu servidor cria uma verificação pela API, leva o usuário para a página de verificação e recebe um aviso assinado quando o número é confirmado."],
  ["Há limites de uso?", "Cada plano define quantas aplicações em produção e quantos aparelhos você pode ter. A capacidade por aparelho será publicada após medições reais."],
];

/** O caminho real do SMS: do celular do usuário ao Android receptor e à confirmação. */
function SmsPath() {
  const chip = "absolute z-10 flex items-center gap-2 rounded-2xl bg-white p-2 text-xs font-semibold leading-snug shadow-[0_12px_32px_-12px_rgb(7_62_66/0.35)] sm:gap-3 sm:p-3 sm:text-sm";
  const num = "flex size-6 shrink-0 items-center justify-center rounded-full bg-petroleo text-xs font-bold text-white sm:size-7";
  return (
    <div role="img" aria-label="O usuário envia o SMS do próprio celular, o Android da Simvio recebe e a Simvio confirma o número via API." className="relative mx-auto aspect-[10/9] w-full max-w-xl self-end lg:max-w-none">
      <img src="/brand/07-faixa-lima-hero.png" alt="" aria-hidden className="absolute bottom-[18%] left-[-6%] w-[112%] max-w-none object-contain" />
      {/* Corta a sombra escura do PNG; o aparelho sai pela base do hero, junto com a mão. */}
      <img src="/brand/02-android-receptor.png" alt="" aria-hidden className="absolute -bottom-[6%] right-0 w-[36%] object-contain [clip-path:inset(5.5%_17%_6%_17%_round_12%)]" />
      <img src="/brand/simbolo.png" alt="" aria-hidden className="absolute left-[50%] top-[40%] z-[1] w-[18%] object-contain" />
      <img src="/brand/01-celular-emissor-com-mao.png" alt="" aria-hidden className="absolute bottom-0 left-0 w-[66%] object-contain" />
      <p className={`${chip} left-[20%] top-[1%] max-w-[48%]`}><span className={num}>1</span> O usuário envia o SMS do próprio número</p>
      <p className={`${chip} right-0 top-[16%] max-w-[36%]`}><span className={num}>2</span> O Android da Simvio recebe</p>
      <p className={`${chip} bottom-[12%] right-0 max-w-[42%]`}><span className={num}>3</span> A Simvio confirma via API</p>
    </div>
  );
}

export default function Landing() {
  const { me } = useSession();
  const { hash } = useLocation();
  // Links como /precos chegam com #planos; rola até a seção depois de renderizar.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);
  const cta = me ? { to: "/app", label: "Abrir painel" } : { to: "/cadastro", label: "Começar agora" };

  return (
    <div className="bg-mineral">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Link to="/" aria-label="Simvio, início"><Logo className="h-12 sm:h-16" /></Link>
        <nav aria-label="Seções" className="hidden gap-8 font-medium md:flex">
          <a href="#como-funciona" className="hover:underline">Como funciona</a>
          <a href="#planos" className="hover:underline">Planos</a>
          <Link to="/documentacao" className="hover:underline">Para desenvolvedores</Link>
        </nav>
        <Button asChild variant="outline"><Link to={me ? "/app" : "/entrar"}>{me ? "Painel" : "Entrar"}</Link></Button>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-8 overflow-clip px-4 pt-6 sm:px-8 lg:grid-cols-[1fr_1.1fr] lg:gap-4">
          <div className="max-w-xl space-y-6 lg:self-center lg:pb-14">
            <BigTitle className="text-[2.6rem] sm:text-6xl">A confirmação parte de você</BigTitle>
            <p className="text-xl text-petroleo-soft">
              Verifique celulares com o SMS que o próprio usuário envia para o seu Android. Mensalidade fixa, sem créditos por mensagem.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild size="lg"><Link to={cta.to}>{cta.label} <ArrowRight aria-hidden /></Link></Button>
              <Button asChild size="lg" variant="ghost"><a href="#como-funciona">Entenda em 3 passos</a></Button>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
              {["Sem instalação para seus usuários", "Integração por API", "Planos simples"].map((t) => (
                <li key={t} className="flex items-center gap-2"><CheckCircle2 className="size-5 text-sucesso" aria-hidden /> {t}</li>
              ))}
            </ul>
            <a href={APK_URL} className="inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4">
              <Smartphone className="size-5" aria-hidden /> Baixar o app receptor para Android
            </a>
          </div>
          <SmsPath />
        </section>

        <section id="como-funciona" className="bg-petroleo text-white">
          <div className="relative mx-auto max-w-6xl space-y-10 overflow-hidden px-4 py-16 sm:px-8">
            <img src="/brand/simbolo-negativo.png" alt="" aria-hidden className="pointer-events-none absolute right-8 top-12 hidden w-64 object-contain opacity-90 lg:block" />
            <div className="space-y-3">
              <p className="font-semibold text-lima">Como funciona</p>
              <h2 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">Simples para o usuário.<br />Transparente para você<span className="text-lima">.</span></h2>
            </div>
            <ol className="grid gap-8 md:grid-cols-3">
              {[
                ["Configure", "Crie a aplicação no painel e integre seu servidor à API da Simvio."],
                ["Conecte", "Instale o app Simvio Receptor em um Android com o seu chip."],
                ["Verifique", "O usuário envia o SMS do próprio número. A Simvio confere remetente, prazo e mensagem e avisa seu servidor."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-4 md:border-l md:border-white/15 md:pl-6">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/10 text-xl font-bold">{i + 1}</span>
                  <div>
                    <h3 className="text-xl font-bold">{t}</h3>
                    <p className="text-white/80">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-6xl space-y-10 px-4 py-16 sm:px-8">
          <div className="space-y-3">
            <p className="font-semibold text-sucesso">Por que a Simvio</p>
            <BigTitle>Mais controle. Menos complexidade</BigTitle>
          </div>
          <div className="grid gap-8 md:grid-cols-3 md:gap-0 md:divide-x md:divide-linha">
            {[
              { icon: Smartphone, t: "Seu número", d: "O SMS chega no chip que você controla. O usuário prova que tem o número enviando a mensagem." },
              { icon: Wallet, t: "Sem créditos por mensagem", d: "Uma mensalidade fixa. Sem tarifa por verificação e sem cobrança surpresa." },
              { icon: Code2, t: "Integração por API", d: "Chaves por ambiente, avisos assinados e exemplos para Node.js, PHP e cURL." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="space-y-3 md:px-8 md:first:pl-0 md:last:pr-0">
                <span className="flex size-12 items-center justify-center rounded-full bg-petroleo text-lima"><Icon className="size-6" aria-hidden /></span>
                <h3 className="text-xl font-bold">{t}</h3>
                <p className="text-petroleo-soft">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="planos" className="border-y border-linha bg-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_2fr]">
            <div className="space-y-3">
              <p className="font-semibold text-sucesso">Valores propostos</p>
              <BigTitle>Planos para diferentes estágios</BigTitle>
              <p className="text-petroleo-soft">Todos incluem ambiente de teste. Teste não conta como aplicação em produção.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {PLANS.map((p) => (
                <Card key={p.name} className="flex flex-col gap-3 md:row-span-4 md:grid md:grid-rows-subgrid">
                  <h3 className="text-xl font-bold">{p.name}</h3>
                  <p className="text-[15px] text-petroleo-soft">{p.text}</p>
                  <p><span className="text-sm">R$</span> <span className="text-4xl font-extrabold">{p.price}</span> <span className="text-petroleo-soft">/mês</span></p>
                  <ul className="space-y-1.5 text-[15px]">
                    <li className="flex gap-2"><CheckCircle2 className="size-5 shrink-0 text-sucesso" aria-hidden /> {p.apps} {p.apps === 1 ? "aplicação" : "aplicações"} em produção</li>
                    <li className="flex gap-2"><CheckCircle2 className="size-5 shrink-0 text-sucesso" aria-hidden /> {p.devices} {p.devices === 1 ? "aparelho receptor" : "aparelhos receptores"}</li>
                    <li className="flex gap-2"><CheckCircle2 className="size-5 shrink-0 text-sucesso" aria-hidden /> Acesso à API e avisos assinados</li>
                  </ul>
                </Card>
              ))}
            </div>
            <p className="text-sm text-petroleo-soft lg:col-start-2">Preços de referência, sujeitos a validação comercial. O envio do SMS pode ser cobrado pela operadora do usuário.</p>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-8 lg:grid-cols-[1fr_2fr]">
          <div className="space-y-3">
            <p className="font-semibold text-sucesso">Dúvidas frequentes</p>
            <BigTitle>Respostas para o que importa</BigTitle>
          </div>
          <div className="divide-y divide-linha rounded-2xl border border-linha bg-white">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group p-5">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">
                  <span className="flex items-center justify-between gap-3">{q}<ArrowRight className="size-5 shrink-0 transition-transform group-open:rotate-90" aria-hidden /></span>
                </summary>
                <p className="mt-3 text-petroleo-soft">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="bg-petroleo text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-12 sm:px-8">
            <div>
              <h2 className="text-3xl font-extrabold tracking-tight">Pronto para simplificar a verificação de celulares?</h2>
              <p className="text-white/80">Comece no ambiente de teste e faça a primeira verificação com SMS real.</p>
            </div>
            <Button asChild size="lg"><Link to={cta.to}>{cta.label} <ArrowRight aria-hidden /></Link></Button>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-8">
        <Logo className="h-9" />
        <nav aria-label="Rodapé" className="flex flex-wrap gap-6 text-[15px]">
          <a href="#como-funciona" className="hover:underline">Como funciona</a>
          <a href="#planos" className="hover:underline">Planos</a>
          <Link to="/documentacao" className="hover:underline">Documentação</Link>
          <a href={APK_URL} className="hover:underline">Baixar app Android</a>
          <Link to="/entrar" className="hover:underline">Entrar</Link>
        </nav>
      </footer>
    </div>
  );
}
