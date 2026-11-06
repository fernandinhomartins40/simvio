import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
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
