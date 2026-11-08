import type { ReactNode } from "react";
import { Link } from "react-router";
import { BigTitle, Logo } from "@/components/brand";
import { Card } from "@/components/ui/card";

const CONTACT = "fuseagencia10@gmail.com";
const UPDATED = "8 de novembro de 2026";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-extrabold">{title}</h2>
      <div className="space-y-3 text-[17px] leading-relaxed [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </section>
  );
}

const Mail = () => <a className="font-semibold underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>;

/** Política de privacidade (site, painel e app Android Simvio). Mantenha alinhada ao que o código realmente guarda. */
export default function Privacy() {
  return (
    <div className="min-h-dvh bg-mineral">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Link to="/" aria-label="Simvio, início"><Logo className="h-10" /></Link>
      </header>
      <main className="mx-auto max-w-3xl space-y-10 px-4 pb-16 sm:px-8">
        <div className="space-y-3">
          <BigTitle>Política de privacidade</BigTitle>
          <p className="text-petroleo-soft">Atualizada em {UPDATED}.</p>
          <p className="text-lg">
            A Simvio confirma números de celular por SMS. Esta política explica, de acordo com a Lei Geral de Proteção de Dados
            (Lei nº 13.709/2018, LGPD), quais dados pessoais tratamos no site simvio.com.br, no painel e no app Android
            <strong> Simvio</strong>, para que servem, com quem são compartilhados, por quanto tempo ficam guardados e como você
            exerce os seus direitos.
          </p>
        </div>

        <Card className="space-y-1 text-[17px]">
          <p><strong>Empresa responsável:</strong> FUSE AGENCIA LTDA, CNPJ 42.761.086/0001-15.</p>
          <p><strong>Endereço:</strong> Rua Antonio Gregorio Ferreira, 298, Conradinho, Guarapuava/PR, CEP 85055-270.</p>
          <p><strong>Encarregado pelo tratamento de dados:</strong> Luiz Fernando Martins Oliveira.</p>
          <p><strong>Contato para privacidade:</strong> <Mail /></p>
        </Card>

        <Section title="1. Papel da Simvio">
          <ul>
            <li>
              <strong>Dados das empresas clientes e da equipe delas:</strong> a Simvio é a <em>controladora</em>, ou seja, decide
              como esses dados são usados.
            </li>
            <li>
              <strong>Números verificados a pedido de um cliente:</strong> a Simvio é a <em>operadora</em>. Tratamos esses dados
              em nome da empresa cliente e só para a verificação que ela pediu. A empresa cliente é a controladora e responde pela
              base legal desse uso.
            </li>
          </ul>
        </Section>

        <Section title="2. Dados das empresas clientes">
          <p>Quando uma empresa cria uma conta, guardamos:</p>
          <ul>
            <li>nome, e-mail e senha (guardada só em forma irreversível, nunca o texto);</li>
            <li>nome da organização, membros da equipe e o registro das ações feitas no painel;</li>
            <li>o navegador usado em cada sessão, para segurança e para você conferir e encerrar acessos;</li>
            <li>aplicações, chaves de API (guardadas só em forma irreversível) e endereços de aviso (webhooks).</li>
          </ul>
          <p>
            Para cobrar a assinatura, enviamos ao Asaas o CPF ou CNPJ, o nome e o e-mail de cobrança. A Simvio não guarda o CPF ou
            CNPJ e não recebe dados de cartão: o pagamento acontece na página do Asaas.
          </p>
          <p>
            <strong>Bases legais:</strong> execução do contrato (art. 7º, V), cumprimento de obrigação legal, como as fiscais
            (art. 7º, II), e legítimo interesse para segurança e prevenção de fraude (art. 7º, IX).
          </p>
        </Section>

        <Section title="3. Pessoas que confirmam o número">
          <p>
            Quando o sistema de um cliente pede uma verificação, recebemos o número de celular a confirmar. A pessoa envia um SMS
            com um código para o número indicado. Usamos o número e o código só para confirmar que aquele celular pertence a quem
            pediu.
          </p>
          <ul>
            <li>o número completo fica guardado cifrado por até 7 dias; depois disso só fica uma versão mascarada;</li>
            <li>o histórico das verificações (com número mascarado) é apagado em 30 dias;</li>
            <li>o resultado é entregue somente ao cliente que pediu a verificação;</li>
            <li>não usamos esses números para marketing nem os compartilhamos com outros clientes.</li>
          </ul>
          <p>O envio do SMS é feito pela própria pessoa e pode ser cobrado pela operadora dela.</p>
        </Section>

        <Section title="4. App Android Simvio">
          <p>
            O app é instalado pela empresa cliente num celular dedicado, com um chip que recebe os SMS de verificação. Para
            funcionar, ele precisa ser o app de SMS padrão do aparelho. Essa escolha é pedida no próprio app, depois de uma tela
            que explica o que acontece com as mensagens.
          </p>
          <ul>
            <li>
              <strong>Mensagens que começam com SIMVIO:</strong> o app envia à Simvio o número de quem mandou, o código e o
              horário de recebimento. Esses dados confirmam a verificação e não ficam guardados no aparelho.
            </li>
            <li>
              <strong>Todas as outras mensagens:</strong> são lidas e guardadas só no próprio celular, como em qualquer app de
              SMS, para o operador ler e responder. Elas não são enviadas à Simvio nem a ninguém.
            </li>
            <li>
              <strong>Dados do aparelho:</strong> fabricante, modelo, versão do Android e do app, número do chip informado pelo
              operador, tipo de conexão, estado da economia de bateria e quantidade de mensagens na fila. Servem para mostrar no
              painel se o aparelho está pronto para receber.
            </li>
            <li>
              O app não pede câmera, localização nem contatos, não tem anúncios e não usa ferramentas de análise de terceiros. O
              QR de conexão é lido pelo leitor do Google Play services, no próprio aparelho.
            </li>
            <li>
              A credencial do aparelho fica cifrada no celular e é apagada, junto com a fila e o histórico local, quando o
              aparelho é desconectado.
            </li>
          </ul>
        </Section>

        <Section title="5. Com quem compartilhamos">
          <ul>
            <li>a empresa cliente que pediu a verificação recebe o resultado dela;</li>
            <li>Asaas Gestão Financeira, para a cobrança das assinaturas;</li>
            <li>VeloMail, para enviar e-mails da conta (confirmação, nova senha, convites);</li>
            <li>Hostinger, empresa que fornece os servidores onde a Simvio funciona;</li>
            <li>autoridades públicas, somente quando houver obrigação legal ou ordem judicial.</li>
          </ul>
          <p>
            Não vendemos dados, não usamos anúncios e não usamos ferramentas de rastreamento ou análise de terceiros. Se algum
            fornecedor tratar dados fora do Brasil, isso acontece só com as garantias exigidas pela LGPD (art. 33).
          </p>
        </Section>

        <Section title="6. Segurança e prazos">
          <ul>
            <li>toda comunicação usa HTTPS; números completos, senhas e segredos ficam cifrados ou guardados de forma irreversível;</li>
            <li>o acesso aos dados de uma organização é restrito aos membros dela;</li>
            <li>registro de ações do painel: 90 dias;</li>
            <li>
              dados da conta: enquanto ela existir. Ao pedir a exclusão, a organização e seus dados são apagados; cópias de
              segurança expiram em até 14 dias. Dados exigidos por lei (como os de cobrança) ficam pelo prazo legal;
            </li>
            <li>
              se houver um incidente de segurança que possa causar risco ou dano relevante, avisamos as pessoas afetadas e a
              Autoridade Nacional de Proteção de Dados (ANPD).
            </li>
          </ul>
        </Section>

        <Section title="7. Cookies">
          <p>
            O site usa só o cookie necessário para manter você conectado ao painel. Não usamos cookies de publicidade nem de
            rastreamento.
          </p>
        </Section>

        <Section title="8. Crianças e adolescentes">
          <p>
            A Simvio é um serviço para empresas e não é destinada a menores de 18 anos. Não coletamos de propósito dados de
            crianças e adolescentes.
          </p>
        </Section>

        <Section title="9. Seus direitos">
          <p>Pela LGPD (art. 18), você pode pedir a qualquer momento:</p>
          <ul>
            <li>confirmação de que tratamos seus dados e acesso a eles;</li>
            <li>correção de dados incompletos, errados ou desatualizados;</li>
            <li>anonimização, bloqueio ou exclusão de dados desnecessários ou tratados em desacordo com a lei;</li>
            <li>portabilidade dos dados;</li>
            <li>informação sobre com quem compartilhamos seus dados;</li>
            <li>revisão de decisões tomadas só de forma automatizada.</li>
          </ul>
          <p>
            Escreva para <Mail />. Respondemos em até 15 dias. Se o seu número foi verificado pelo sistema de uma empresa cliente,
            você também pode falar diretamente com ela, que é a controladora desse dado. Você também pode reclamar à ANPD em
            gov.br/anpd.
          </p>
        </Section>

        <Section title="10. Mudanças">
          <p>
            Se esta política mudar, a data no topo é atualizada. Mudanças importantes são avisadas por e-mail aos clientes antes de
            valer.
          </p>
        </Section>
      </main>
    </div>
  );
}
