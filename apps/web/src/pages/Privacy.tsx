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

/** Política de privacidade (site, painel e app Simvio). Mantenha alinhada ao que o código realmente guarda. */
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
            A Simvio confirma números de celular por SMS. Esta política explica quais dados tratamos no site, no painel e no app
            Android <strong>Simvio</strong>, para que servem, com quem são compartilhados e por quanto tempo ficam guardados.
          </p>
        </div>

        <Card className="space-y-1 text-[17px]">
          <p><strong>Responsável pelos dados:</strong> FUSE AGENCIA LTDA, CNPJ 42.761.086/0001-15, Guarapuava/PR.</p>
          <p><strong>Contato para privacidade (encarregado):</strong> <a className="font-semibold underline" href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
        </Card>

        <Section title="1. Clientes do painel">
          <p>Quando uma empresa cria uma conta, guardamos:</p>
          <ul>
            <li>nome, e-mail e senha (guardada só em forma irreversível, nunca o texto);</li>
            <li>nome da organização, membros da equipe e o registro das ações feitas no painel;</li>
            <li>o navegador usado em cada sessão, para você conferir e encerrar acessos;</li>
            <li>aplicações, chaves de API (guardadas só em forma irreversível) e endereços de aviso (webhooks).</li>
          </ul>
          <p>
            Para cobrar a assinatura, enviamos ao Asaas o CPF ou CNPJ, o nome e o e-mail de cobrança. A Simvio não guarda o CPF ou CNPJ
            e não recebe dados de cartão: o pagamento acontece na página do Asaas.
          </p>
        </Section>

        <Section title="2. Pessoas que confirmam o número">
          <p>
            Quando o sistema de um cliente pede uma verificação, recebemos o número de celular a confirmar. A pessoa envia um SMS com um
            código para o número indicado. Usamos o número e o código só para confirmar que aquele celular pertence a quem pediu.
          </p>
          <ul>
            <li>o número completo fica guardado cifrado por até 7 dias; depois disso só fica uma versão mascarada;</li>
            <li>o histórico das verificações (com número mascarado) é apagado em 30 dias;</li>
            <li>o resultado é entregue somente ao cliente que pediu a verificação.</li>
          </ul>
          <p>O envio do SMS é feito pela própria pessoa e pode ser cobrado pela operadora dela.</p>
        </Section>

        <Section title="3. App Android Simvio">
          <p>
            O app é instalado pelo cliente num celular dedicado, com um chip que recebe os SMS de verificação. Para funcionar, ele precisa
            ser o app de SMS padrão do aparelho.
          </p>
          <ul>
            <li>
              <strong>Mensagens que começam com SIMVIO:</strong> o app envia à Simvio o número de quem mandou, o código e o horário de
              recebimento. Esses dados confirmam a verificação e não ficam guardados no aparelho.
            </li>
            <li>
              <strong>Todas as outras mensagens:</strong> são lidas e guardadas só no próprio celular, como em qualquer app de SMS, para o
              operador ler e responder. Elas não são enviadas à Simvio nem a ninguém.
            </li>
            <li>
              <strong>Dados do aparelho:</strong> fabricante, modelo, versão do Android e do app, número do chip informado pelo operador,
              tipo de conexão, estado da economia de bateria e quantidade de mensagens na fila. Servem para mostrar no painel se o aparelho
              está pronto para receber.
            </li>
            <li>
              O app não pede câmera, localização nem contatos. O QR de conexão é lido pelo leitor do Google Play services, no próprio
              aparelho.
            </li>
            <li>
              A credencial do aparelho fica cifrada no celular e é apagada, junto com a fila e o histórico local, quando o aparelho é
              desconectado.
            </li>
          </ul>
        </Section>

        <Section title="4. Com quem compartilhamos">
          <ul>
            <li>o cliente que pediu a verificação recebe o resultado dela;</li>
            <li>Asaas, para a cobrança das assinaturas;</li>
            <li>VeloMail, para enviar e-mails da conta (confirmação, nova senha, convites);</li>
            <li>Hostinger, empresa que fornece os servidores onde a Simvio funciona.</li>
          </ul>
          <p>Não vendemos dados, não usamos anúncios e não usamos ferramentas de rastreamento ou análise de terceiros.</p>
        </Section>

        <Section title="5. Segurança e prazos">
          <ul>
            <li>toda comunicação usa HTTPS; números completos e segredos ficam cifrados;</li>
            <li>registro de ações do painel: 90 dias;</li>
            <li>dados da conta: enquanto ela existir. Ao pedir a exclusão, a organização e seus dados são apagados; cópias de segurança expiram em até 14 dias;</li>
            <li>o site usa só o cookie necessário para manter você conectado.</li>
          </ul>
        </Section>

        <Section title="6. Seus direitos">
          <p>
            Pela Lei Geral de Proteção de Dados (LGPD), você pode pedir acesso, correção, portabilidade ou exclusão dos seus dados, e
            informações sobre o compartilhamento. Escreva para <a className="font-semibold underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
            Respondemos em até 15 dias. Se o seu número foi verificado pelo sistema de uma empresa cliente, você também pode falar
            diretamente com ela.
          </p>
        </Section>

        <Section title="7. Mudanças">
          <p>Se esta política mudar, a data no topo é atualizada.</p>
        </Section>
      </main>
    </div>
  );
}
