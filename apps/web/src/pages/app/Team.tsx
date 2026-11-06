import { useState } from "react";
import { UserPlus } from "lucide-react";
import { LoadError, Loading, PageHeader, StatusBadge } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import { Field, FormError, SelectField } from "@/components/ui/form";
import { useOrg } from "@/layouts/AppShell";
import { useAction } from "@/lib/action";
import { dateTime, roleLabel } from "@/lib/format";
import { del, patch, post, useResource, useSession, type Role } from "@/lib/session";
import type { Members } from "@/lib/types";

const roleHelp: Record<Role, string> = {
  owner: "Tudo, inclusive equipe, assinatura e dados da organização.",
  developer: "Aplicações, chaves, avisos e aparelhos.",
  viewer: "Apenas consulta.",
};

export default function TeamPage() {
  const { base, isOwner } = useOrg();
  const { me } = useSession();
  const { data, error, loading, reload } = useResource<Members>(`${base}/members`);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("developer");
  const [sent, setSent] = useState<string | null>(null);

  const invite = useAction(async () => {
    await post(`${base}/invitations`, { email, role });
    setSent(email);
    setEmail("");
    reload();
  });
  const changeRole = useAction(async (id: string, r: Role) => {
    await patch(`${base}/members/${id}`, { role: r });
    reload();
  });
  const removeMember = useAction(async (id: string, name: string) => {
    if (!confirm(`Remover ${name} da equipe?`)) return;
    await del(`${base}/members/${id}`);
    reload();
  });
  const cancelInvite = useAction(async (id: string) => {
    await del(`${base}/invitations/${id}`);
    reload();
  });

  return (
    <>
      <PageHeader title="Equipe" description="Quem acessa esta organização e o que cada pessoa pode fazer." />
      {loading && !data && <Loading />}
      {error && !data && <LoadError error={error} onRetry={reload} />}
      <FormError message={changeRole.error ?? removeMember.error ?? cancelInvite.error} />

      {data && (
        <Card className="p-0">
          <ul className="divide-y divide-linha">
            {data.members.map((m) => (
              <li key={m.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold">{m.name}{m.user_id === me?.user.id && " (você)"}</p>
                  <p className="truncate text-sm text-petroleo-soft">{m.email}</p>
                </div>
                {isOwner ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${m.id}`}>Papel de {m.name}</label>
                    <select
                      id={`role-${m.id}`}
                      value={m.role}
                      onChange={(e) => changeRole.run(m.id, e.target.value as Role)}
                      className="rounded-xl border border-linha bg-white px-3 py-2"
                    >
                      {(Object.keys(roleLabel) as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                    </select>
                    <Button size="sm" variant="ghost" onClick={() => removeMember.run(m.id, m.name)}>Remover</Button>
                  </div>
                ) : (
                  <StatusBadge tone="off">{roleLabel[m.role]}</StatusBadge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data && data.invitations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Convites pendentes</h2>
          <Card className="p-0">
            <ul className="divide-y divide-linha">
              {data.invitations.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                  <div>
                    <p className="font-semibold">{i.email}</p>
                    <p className="text-sm text-petroleo-soft">{roleLabel[i.role]} · vale até {dateTime(i.expires_at)}</p>
                  </div>
                  {isOwner && <Button size="sm" variant="ghost" onClick={() => cancelInvite.run(i.id)}>Cancelar convite</Button>}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {isOwner && (
        <Card className="space-y-4 lg:max-w-xl">
          <h2 className="flex items-center gap-2 text-xl font-bold"><UserPlus className="size-5" aria-hidden /> Convidar pessoa</h2>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setSent(null); invite.run(); }}>
            <Field label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <SelectField label="Papel" value={role} onChange={(e) => setRole(e.target.value as Role)} hint={roleHelp[role]}>
              {(Object.keys(roleLabel) as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
            </SelectField>
            <FormError message={invite.error} />
            {sent && <Notice tone="success"><p>Convite enviado para {sent}. O link vale por 7 dias.</p></Notice>}
            <Button type="submit" disabled={invite.busy}>Enviar convite</Button>
          </form>
        </Card>
      )}
    </>
  );
}
