import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-linha bg-white p-5", className)} {...props} />;
}

export function Notice({
  tone = "info",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: "info" | "warn" | "error" | "success" }) {
  const tones = {
    info: "bg-blue-50 text-petroleo border-blue-100",
    warn: "bg-amber-50 text-petroleo border-amber-200",
    error: "bg-red-50 text-petroleo border-red-200",
    success: "bg-lima/25 text-petroleo border-lima",
  };
  return <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-4 text-[15px]", tones[tone], className)} {...props} />;
}
