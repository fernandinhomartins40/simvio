import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Check, Circle, Eye, EyeOff, X } from "lucide-react";
import { isStrongPassword, PASSWORD_MAX_LENGTH, PASSWORD_RULES } from "@simvio/contracts";
import { cn } from "@/lib/utils";

const control =
  "w-full rounded-xl border border-linha bg-white px-4 py-3 text-base text-petroleo placeholder:text-petroleo-soft/70 focus:border-petroleo disabled:bg-mineral";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
}

export function Field({ label, hint, error, className, ...props }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <input
        id={id}
        className={control}
        aria-invalid={!!error}
        aria-describedby={hint || error ? `${id}-d` : undefined}
        {...props}
      />
      {(hint || error) && (
        <p id={`${id}-d`} className={cn("text-sm", error ? "text-erro" : "text-petroleo-soft")}>{error ?? hint}</p>
      )}
    </div>
  );
}

export function SelectField({ label, hint, children, className, ...props }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <select id={id} className={control} {...props}>{children}</select>
      {hint && <p className="text-sm text-petroleo-soft">{hint}</p>}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-[15px]">{message}</p>;
}

export function PasswordField({ label, error, className, ...props }: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <div className="relative">
        <input id={id} type={visible ? "text" : "password"} className={cn(control, "pr-14")} aria-invalid={!!error} maxLength={PASSWORD_MAX_LENGTH} {...props} />
        <button
          type="button"
          aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-petroleo-soft hover:text-petroleo"
        >
          {visible ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

/** Estado de senha nova com confirmação. `ok` só é verdadeiro com todas as regras atendidas e as duas iguais. */
export function useNewPassword() {
  const [value, setValue] = useState("");
  const [confirm, setConfirm] = useState("");
  return {
    value,
    setValue,
    confirm,
    setConfirm,
    ok: isStrongPassword(value) && value === confirm,
    clear() {
      setValue("");
      setConfirm("");
    },
  };
}

export const NEW_PASSWORD_ERROR = "Confira a senha: todas as regras precisam estar marcadas e as duas senhas iguais.";

function PasswordCheck({ done, failed, children }: { done: boolean; failed?: boolean; children: ReactNode }) {
  const Icon = done ? Check : failed ? X : Circle;
  return (
    <li className={cn("flex items-center gap-2", done ? "font-semibold text-sucesso" : failed ? "text-erro" : "text-petroleo-soft")}>
      <Icon className={cn("size-4 shrink-0", !done && !failed && "size-3.5")} aria-hidden />
      <span>{children}<span className="sr-only">{done ? " (atendida)" : " (pendente)"}</span></span>
    </li>
  );
}

export function NewPasswordFields({ state, label = "Senha" }: { state: ReturnType<typeof useNewPassword>; label?: string }) {
  const same = state.confirm.length > 0 && state.value === state.confirm;
  const different = state.confirm.length > 0 && state.value !== state.confirm;
  return (
    <>
      <PasswordField label={label} autoComplete="new-password" required value={state.value} onChange={(e) => state.setValue(e.target.value)} />
      <PasswordField label={`Confirmar ${label.toLowerCase()}`} autoComplete="new-password" required error={different ? "diferente" : undefined} value={state.confirm} onChange={(e) => state.setConfirm(e.target.value)} />
      <ul aria-live="polite" className="grid gap-1.5 rounded-xl bg-mineral p-3 text-sm sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => <PasswordCheck key={rule.label} done={rule.test(state.value)}>{rule.label}</PasswordCheck>)}
        <PasswordCheck done={same} failed={different}>{different ? "As senhas estão diferentes" : "As duas senhas são iguais"}</PasswordCheck>
      </ul>
    </>
  );
}
