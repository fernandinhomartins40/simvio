import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-lima text-petroleo hover:bg-lima-600",
        dark: "bg-petroleo text-white hover:bg-petroleo-700",
        outline: "border border-linha bg-white text-petroleo hover:bg-mineral",
        ghost: "text-petroleo hover:bg-petroleo/5",
        danger: "bg-erro text-white hover:bg-erro/90",
      },
      size: {
        lg: "min-h-14 px-6 text-lg",
        md: "min-h-11 px-4 text-base",
        sm: "min-h-9 px-3 text-sm",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
