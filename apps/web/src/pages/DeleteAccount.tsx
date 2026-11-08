import type { ReactNode } from "react";
import { Link } from "react-router";
import { BigTitle, Logo } from "@/components/brand";
import { Card } from "@/components/ui/card";

const CONTACT = "fuseagencia10@gmail.com";
const SUBJECT = "Excluir conta Simvio";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-extrabold">{title}</h2>
      <div className="space-y-3 text-[17px] leading-relaxed [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </section>
  );
}

/** Pedido de exclusão de conta (exigido pela Play Store). Mantenha alinhado ao que a exclusão no admin realmente apaga. */
export default function DeleteAccount() {
  const mailto = `mailto:${CONTACT}?subject=${encodeURIComponent(SUBJECT)}`;
  return (
    <div className="min-h-dvh bg-mineral">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
        <Link to="/" aria-label="Simvio, início"><Logo className="h-10" /></Link>
      </header>
      <main className="mx-auto max-w-3xl space-y-10 px-4 pb-16 sm:px-8">
        <div className="space-y-3">
          <BigTitle>Excluir conta e dados</BigTitle>
          <p className="text-lg">
            Esta página explica como excluir a sua conta da <strong>Simvio</strong> (site, painel e app Android Simvio), mantidos
            pela FUSE AGENCIA LTDA, CNPJ 42.761.086/0001-15.
          </p>
        </div>

        <Section title="Como pedir a exclusão">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Envie um e-mail para <a className="font-semibold underline" href={mailto}>{CONTACT}</a> com o assunto
              <strong> “{SUBJECT}”</strong>.
            </li>
            <li>Envie a partir do e-mail cadastrado na conta e informe o nome da organização.</li>
            <li>Se a conta tiver uma assinatura, ela é cancelada junto com a exclusão.</li>
            <li>Confirmamos o pedido por e-mail e concluímos a exclusão em até 15 dias.</li>
          </ol>
          <Card className="text-[17px]">
            <a className="font-semibold underline" href={mailto}>Enviar pedido de exclusão por e-mail</a>
          </Card>
        </Section>

        <Section title="O que é apagado">
          <ul>
            <li>a organização, seus membros e os usuários que só pertenciam a ela;</li>
            <li>aplicações, chaves de API e endereços de aviso (webhooks);</li>
            <li>aparelhos conectados e números de chip cadastrados;</li>
            <li>histórico de verificações e registro de ações do painel.</li>
          </ul>
        </Section>

        <Section title="O que fica guardado e por quanto tempo">
          <ul>
            <li>cópias de segurança expiram em até 14 dias;</li>
            <li>um registro interno de que a exclusão foi feita (nome da organização e data) fica por até 90 dias;</li>
            <li>dados de cobrança e notas fiscais ficam pelo prazo exigido pela legislação fiscal (até 5 anos), no Asaas.</li>
          </ul>
        </Section>

        <Section title="Excluir só alguns dados">
          <p>
            Você também pode pedir a exclusão de dados específicos sem apagar a conta, pelo mesmo e-mail. No app Android, a opção
            <strong> Desconectar este aparelho</strong> apaga do celular a credencial, a fila e o histórico local.
          </p>
          <p>
            Mais detalhes na <Link className="font-semibold underline" to="/privacidade">política de privacidade</Link>.
          </p>
        </Section>
      </main>
    </div>
  );
}
