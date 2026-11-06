import { cn } from "@/lib/utils";

/** Logo oficial em PNG (01_IDENTIDADE_VISUAL). Proporção preservada com object-contain. */
export function Logo({ className, negative = false }: { className?: string; negative?: boolean }) {
  return (
    <img
      src={negative ? "/brand/logo-negativa.png" : "/brand/logo.png"}
      alt="Simvio"
      width={1942}
      height={809}
      className={cn("h-12 w-auto object-contain", className)}
    />
  );
}

export function Symbol({ className }: { className?: string }) {
  return <img src="/brand/simbolo.png" alt="" aria-hidden width={1735} height={906} className={cn("h-6 w-auto object-contain", className)} />;
}

/** Título grande com ponto final em lima (decorativo), como nas referências. */
export function BigTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h1 className={cn("text-4xl font-extrabold leading-[1.05] tracking-tight text-petroleo sm:text-5xl", className)}>
      {children}
      <span aria-hidden className="text-lima-600">.</span>
    </h1>
  );
}
