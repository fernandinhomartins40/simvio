import { useState } from "react";
import { useNavigate } from "react-router";
import { PageHeader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import { Field, FormError, NEW_PASSWORD_ERROR, NewPasswordFields, PasswordField, useNewPassword } from "@/components/ui/form";
import { useOrg } from "@/layouts/AppShell";
import { useAction } from "@/lib/action";
import { dateTime } from "@/lib/format";
import { patch, post, useResource, useSession } from "@/lib/session";
import type { AuditRow } from "@/lib/types";

export const auditLabel: Record<string, string> = {
  "organization.updated": "Organização atualizada",
  "application.created": "Aplicação criada",
  "application.updated": "Aplicação alterada",
  "application.archived": "Aplicação arquivada",
  "application.live_enabled": "Produção habilitada",
  "application.live_disabled": "Produção desabilitada",
  "api_key.created": "Chave criada",
  "api_key.revoked": "Chave revogada",
  "agent_key.created": "Chave de agente de IA criada",
  "agent_key.revoked": "Chave de agente de IA revogada",
  "webhook.created": "Endereço de aviso criado",
  "webhook.updated": "Endereço de aviso alterado",
  "webhook.deleted": "Endereço de aviso excluído",
  "webhook.secret_rotated": "Segredo de aviso trocado",
  "webhook.redelivered": "Aviso reenviado",
  "organization.created": "Organização criada",
  "device.pairing_created": "Código de conexão gerado",
  "device.paired": "Aparelho conectado",
  "device.line_registered": "Número do chip cadastrado",
  "device.line_verified": "Número do chip confirmado",
  "user.password_changed": "Senha alterada",
  "user.password_reset": "Senha redefinida",
  "device.revoked": "Aparelho revogado",
  "member.invited": "Pessoa convidada",
  "member.joined": "Pessoa entrou na equipe",
  "member.role_changed": "Papel alterado",
  "member.removed": "Pessoa removida",
  "member.invitation_revoked": "Convite cancelado",
  "user.super_admin_granted": "Acesso de administração concedido",
};

export default function SettingsPage() {
  const { me, refresh } = useSession();
  const { base, orgName, isOwner, canEdit } = useOrg();
  const navigate = useNavigate();

  const [current, setCurrent] = useState("");
  const pw = useNewPassword();
  const [changed, setChanged] = useState(false);
  const change = useAction(async () => {
    setChanged(false);
    if (!pw.ok) throw new Error(NEW_PASSWORD_ERROR);
    await post("/auth/change-password", { current_password: current, new_password: pw.value });
    setCurrent("");
    pw.clear();
    setChanged(true);
  });

  const logoutAll = useAction(async () => {
    if (!confirm("Encerrar a sessão em todos os aparelhos, inclusive este?")) return;
    await post("/auth/logout-all");
    await refresh();
    navigate("/entrar", { replace: true });
  });

  const [name, setName] = useState(orgName);
  const rename = useAction(async () => {
    await patch(base, { name });
    await refresh();
  });

  const audit = useResource<AuditRow[]>(canEdit ? `${base}/audit-logs` : null);

  return (
    <>
      <PageHeader title="Configurações" description={me ? `Conectado como ${me.user.email}` : undefined} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-4">
          <h2 className="text-xl font-bold">Trocar senha</h2>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); change.run(); }}>
            <PasswordField label="Senha atual" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            <NewPasswordFields state={pw} label="Nova senha" />
            <FormError message={change.error} />
            {changed && <Notice tone="success"><p>Senha alterada. As outras sessões foram encerradas.</p></Notice>}
            <Button type="submit" disabled={change.busy}>Salvar nova senha</Button>
          </form>
        </Card>

        <div className="space-y-6">
          {isOwner && (
            <Card className="space-y-4">
              <h2 className="text-xl font-bold">Organização</h2>
              <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); rename.run(); }}>
                <Field label="Nome" className="flex-1" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
                <Button type="submit" variant="outline" disabled={rename.busy}>Salvar</Button>
              </form>
              <FormError message={rename.error} />
            </Card>
          )}
          <Card className="space-y-3">
            <h2 className="text-xl font-bold">Sessões</h2>
            <p className="text-[15px]">Perdeu um aparelho ou entrou em um computador compartilhado? Encerre todas as sessões abertas.</p>
            <FormError message={logoutAll.error} />
            <Button variant="outline" disabled={logoutAll.busy} onClick={() => logoutAll.run()}>Sair de todos os aparelhos</Button>
          </Card>
        </div>
      </div>

      {canEdit && audit.data && (
        <section className="space-y-3">
          <h2 className="text-2xl font-extrabold">Registro de atividades</h2>
          <Card className="p-0">
            {audit.data.length === 0 ? (
              <p className="p-4 text-petroleo-soft">Nenhuma atividade registrada.</p>
            ) : (
              <ul className="divide-y divide-linha">
                {audit.data.map((a) => (
                  <li key={a.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-[15px]">
                    <span>{auditLabel[a.action] ?? a.action}</span>
                    <span className="text-petroleo-soft">{a.actor_type === "user" ? "pessoa da equipe" : a.actor_type === "device" ? "aparelho" : "equipe Simvio"} · {dateTime(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}
    </>
  );
}
