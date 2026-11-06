import { useState, type ReactNode } from "react";
import { AlertTriangle, Check, CheckCircle2, Clock, Copy, Loader2, XCircle, type LucideIcon } from "lucide-react";
import { BigTitle } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, Notice } from "@/components/ui/card";
import type { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <BigTitle className="text-3xl sm:text-4xl">{title}</BigTitle>
        {description && <p className="max-w-2xl text-lg text-petroleo-soft">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Loading() {
  return (
    <p role="status" className="flex items-center gap-2 py-8 text-petroleo-soft">
      <Loader2 className="size-5 animate-spin" aria-hidden /> Carregando…
    </p>
  );
}

export function LoadError({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <Notice tone="error">
      <AlertTriangle className="size-5 shrink-0" aria-hidden />
      <div className="space-y-2">
        <p>{error.message}</p>
        {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Tentar de novo</Button>}
      </div>
    </Notice>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-lima/30"><Icon className="size-7" aria-hidden /></span>
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="max-w-md text-petroleo-soft">{text}</p>
      {action}
    </Card>
  );
}

export type Tone = "ok" | "wait" | "warn" | "error" | "off";

const TONES: Record<Tone, { icon: LucideIcon; cls: string }> = {
  ok: { icon: CheckCircle2, cls: "bg-green-50 text-green-800" },
  wait: { icon: Clock, cls: "bg-blue-50 text-blue-800" },
  warn: { icon: AlertTriangle, cls: "bg-amber-50 text-amber-900" },
  error: { icon: XCircle, cls: "bg-red-50 text-red-800" },
  off: { icon: Clock, cls: "bg-slate-100 text-slate-700" },
};

/** Estado sempre com ícone e texto, nunca só cor. */
export function StatusBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  const { icon: Icon, cls } = TONES[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold whitespace-nowrap", cls)}>
      <Icon className="size-4" aria-hidden /> {children}
    </span>
  );
}

export const verificationStatus: Record<string, { tone: Tone; label: string }> = {
  pending: { tone: "wait", label: "Aguardando SMS" },
  verified: { tone: "ok", label: "Verificado" },
  expired: { tone: "off", label: "Expirado" },
  cancelled: { tone: "off", label: "Cancelado" },
  failed: { tone: "error", label: "Falhou" },
};

export const deviceHealthStatus: Record<string, { tone: Tone; label: string }> = {
  online: { tone: "ok", label: "Comunicando" },
  degraded: { tone: "warn", label: "Sinal atrasado" },
  offline: { tone: "error", label: "Sem comunicação" },
  revoked: { tone: "off", label: "Revogado" },
};

export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      }}
    >
      {done ? <Check className="text-sucesso" aria-hidden /> : <Copy aria-hidden />}
      {done ? "Copiado" : label}
    </Button>
  );
}

/** Segredo exibido uma única vez, logo após criar ou rotacionar. */
export function SecretOnce({ value, name }: { value: string; name: string }) {
  return (
    <Notice tone="warn" className="flex-col">
      <p className="font-semibold">Copie agora: {name} não será mostrada de novo.</p>
      <code className="block break-all rounded-lg bg-white p-3 font-mono text-sm">{value}</code>
      <CopyButton value={value} label={`Copiar ${name}`} />
    </Notice>
  );
}

export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-petroleo p-4 pr-24 font-mono text-sm leading-relaxed text-white"><code>{code}</code></pre>
      <div className="absolute right-3 top-3"><CopyButton value={code} /></div>
    </div>
  );
}
